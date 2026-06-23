# Media

Screenshots and the war-room GIF are captured by driving the running prototype in
Chrome, not committed from the build. Verified screens (login, advisor price-set,
staying election with the peer redacted, compute/legs, atomic settle, close-reverted,
oversight fairness view, dashboard) and a `war-room-close.gif` were produced during
verification and live in the browser's screenshot store / Downloads.

## Regenerate

1. `python3 -m http.server 8000` from `portal/`, open `http://localhost:8000/`.
2. Open the **advisor**, **buyer**, and a **staying** seat in three side-by-side tabs.
3. Walk the deal to the close (see `../demo-script.md`), then fire **CLOSE — ALL AT
   ONCE** in the advisor tab — every tab's legs animate together.
4. Record the close as a screen GIF; drop screenshots of the key screens here.

For a richer GIF, capture the close as discrete steps (not one batched action) so the
intermediate leg-sweep frames are recorded.
