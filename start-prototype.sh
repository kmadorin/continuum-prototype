#!/usr/bin/env bash
# Launch a fresh Claude Code session for building the Continuum prototype:
# - design-system prompt loaded (appended to defaults)
# - Claude for Chrome enabled for visual feedback
# Then, inside the session, send:
#   Read docs/prompts/PROTOTYPE_BRIEF.md and execute it.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f design/system-prompt.md ]; then
  echo "design/system-prompt.md not found — run from the continuum project root." >&2
  exit 1
fi

echo "Launching Claude Code: design system + Claude for Chrome…"
echo "Once inside, paste:  Read docs/prompts/PROTOTYPE_BRIEF.md and execute it."
exec claude --append-system-prompt-file design/system-prompt.md --chrome -n continuum-prototype
