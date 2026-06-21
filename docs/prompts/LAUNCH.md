# Launch — Continuum Prototype Build Session

How to start the **fresh Claude Code chat** that builds the interactive prototype, with the design system loaded and Claude for Chrome enabled for visual feedback.

## Prerequisites (one-time)
- **Claude Code ≥ 2.1.73** on a **direct Anthropic plan** (Pro/Max/Team/Enterprise). Claude for Chrome is **not** available via Bedrock/Vertex/Foundry.
- **Google Chrome (or Edge) ≥ 1.0.36** with the **Claude in Chrome extension** installed and logged in: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn
- (Brave/Arc/WSL not yet supported.)

## Start the session

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum
claude --append-system-prompt-file design/system-prompt.md --chrome -n continuum-prototype
```

- `--append-system-prompt-file design/system-prompt.md` — loads the design-system persona **on top of** Claude Code's defaults (keeps tool/safety guidance). This is how the design system prompt gets passed to Claude before the build prompt.
- `--chrome` — enables Claude for Chrome (the `mcp__claude-in-chrome__*` tools) so the session can open the prototype, screenshot, and iterate on design. Run `/chrome` inside the session to check connection / grant site permissions.
- `-n continuum-prototype` — names the session for easy resume (`claude --resume continuum-prototype`).

Or just run the helper:
```bash
./start-prototype.sh
```

## Then pass the build prompt

In the new session, send:

```
Read docs/prompts/PROTOTYPE_BRIEF.md and execute it. Start with the brief discovery questions if any, then build.
```

That brief is self-contained and points to the spec, story map, pitch design, and the vendored design-system skills.

## Notes
- **Why append, not `--system-prompt-file` (replace):** appending preserves Claude Code's coding/tool/safety instructions while adding the design persona. Use replace only if you want a pure design coach with no coding scaffolding.
- **Alternative (reusable):** convert `design/system-prompt.md` into an output style at `.claude/output-styles/continuum-design.md` (add YAML frontmatter `name`, `description`, `keep-coding-instructions: true`) and select it via `/config`. Good if you'll reuse it across sessions; the flag approach is fine for a one-off build.
- **Linking the prior design chat:** the spec + story map already capture its output. For raw "why" context, that session is `2520b370-d71d-4073-ac20-10015f94badd` (transcript: `~/.claude/projects/-Users-kirillmadorin-Projects-hackathons-canton/2520b370-d71d-4073-ac20-10015f94badd.jsonl`). Resume only works from the `/canton` dir, not `/continuum`.
- Claude for Chrome can also be toggled mid-session with `/chrome`, or defaulted via `.claude/settings.json` → `{"chromeEnabled": true}` (raises context usage).
