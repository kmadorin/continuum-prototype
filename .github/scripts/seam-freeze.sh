#!/usr/bin/env bash
# Two-tier seam freeze for ui-ux PRs.
#   HARD: the ledger client, the preview's own mock, and the custody spine's identity/
#         session/provisioning. A redesign has no business here and there is no override.
#   SOFT: everything else a redesign legitimately reaches — route logic, the anchored
#         DOCUMENTS (which are the designer's to restyle), their generated hashes/manifest,
#         regenerated fixtures, and the frontend seam. Fails by default; the `seam-change`
#         PR label releases it. The label is not an escape hatch — it is the signal to the
#         owner to actually READ that hunk.
#
# WHY docs/ IS NOT HARD: restyling app/custody/docs/*.html changes their bytes, which
# REGENERATES hashes.ts + manifest.json (they are marked "GENERATED — do not edit by hand").
# That coupling is mandatory and legitimate, so hard-freezing it would block real work with
# no recourse — and a gate that fires on correct work is one people learn to route around.
# Usage: seam-freeze.sh <base-sha> <head-sha> <labels-json>
set -euo pipefail

BASE="$1"; HEAD="$2"; LABELS="${3:-[]}"

# THREE dots (merge-base), not two. Two-dot diffs the tips directly, so once main gets a
# backend commit that ui-ux hasn't merged, a ui-ux PR would diff as REVERTING app/custody/**
# → hard fail, no override, on a PR that touched nothing but CSS. That teaches the designer
# the gate is noise. Requires fetch-depth: 0 in the workflow (it's set).
CHANGED="$(git diff --name-only "$BASE...$HEAD")"
[ -z "$CHANGED" ] && { echo "no changes"; exit 0; }

# HARD: real backend logic — the ledger client, the custody spine (app/session/tenants/
# provisioning), and the preview's own mock infra. `app.ts` STAYS here: it is the route
# logic, not a generated artifact, and a redesign editing it is a decision the owner must
# make deliberately, not something a label waves through.
hard="$(echo "$CHANGED" | grep -E '^app/ledger-client/|^app/custody/(mock/|app\.ts|server.*\.ts|tenants\.ts|session\.ts|provision\.ts)' || true)"
# SOFT: NOT backend logic — the anchored DOCUMENTS (the designer's to restyle), their
# GENERATED hashes/manifest, regenerated fixtures, and the frontend seam.
soft="$(echo "$CHANGED" | grep -E '^app/custody/(docs/|fixtures/)|^app/web/src/(lib|ledger)/' || true)"

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
