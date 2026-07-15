#!/usr/bin/env bash
# Two-tier seam freeze for ui-ux PRs.
#   HARD: backend/ledger paths. A UI redesign touching these is always wrong. No override.
#   SOFT: frontend seam paths. Overridable with the `seam-change` PR label — which exists
#         to make the owner READ the hunk, not to wave it through.
# Usage: seam-freeze.sh <base-sha> <head-sha> <labels-json>
set -euo pipefail

BASE="$1"; HEAD="$2"; LABELS="${3:-[]}"

# THREE dots (merge-base), not two. Two-dot diffs the tips directly, so once main gets a
# backend commit that ui-ux hasn't merged, a ui-ux PR would diff as REVERTING app/custody/**
# → hard fail, no override, on a PR that touched nothing but CSS. That teaches the designer
# the gate is noise. Requires fetch-depth: 0 in the workflow (it's set).
CHANGED="$(git diff --name-only "$BASE...$HEAD")"
[ -z "$CHANGED" ] && { echo "no changes"; exit 0; }

hard="$(echo "$CHANGED" | grep -E '^app/(custody|ledger-client)/' || true)"
soft="$(echo "$CHANGED" | grep -E '^app/web/src/(lib|ledger)/' || true)"

fail=0
if [ -n "$hard" ]; then
  echo "::error::FROZEN SEAM (hard, no override) — a UI redesign must not touch the backend:"
  echo "$hard" | sed 's/^/  /'
  fail=1
fi

if [ -n "$soft" ]; then
  if echo "$LABELS" | grep -q '"seam-change"'; then
    echo "::warning::Frontend seam touched; allowed by the 'seam-change' label. REVIEW THESE HUNKS:"
    echo "$soft" | sed 's/^/  /'
  else
    echo "::error::FROZEN SEAM (soft) — add the 'seam-change' label if this is intentional:"
    echo "$soft" | sed 's/^/  /'
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "seam freeze: OK"
exit "$fail"
