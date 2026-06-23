# Media

Screenshots and the close GIF are captured by driving the running prototype in Chrome — not
committed binaries. Key screens verified during the build: dashboard (task queue), sealed bid
book (sealed → opened/cleared), LP elections with peers redacted, allocation legs + tie-out,
per-leg approvals, atomic settlement receipt, oversight fairness attestations, and the flywheel.

## Regenerate

1. From `portal/`: `python3 -m http.server 8765`, open `http://localhost:8765/`.
2. Open **Advisor**, a **Buyer**, and an **LP** in three side-by-side tabs (sign in, or use
   **Demo · jump to role**).
3. Walk the deal to the close (see `../demo-script.md`); fire **Settle atomically** in the
   Advisor tab — every tab's legs sweep to *Settled* together.
4. Record the close as a screen GIF (capture a few frames before/after for smooth playback);
   drop screenshots of the key screens here.
