# Continuum — Pitch Design Tokens

Extracted from `/Users/kirillmadorin/Projects/hackathons/canton/pitch` (styles are embedded `<style>` blocks; **`pitch/deck.html` is the most complete — copy its `:root` + components as the base**). No external CSS, no build step.

**Aesthetic:** modern institutional dark theme. Deep near-black backgrounds, one cyan/teal accent, **sharp corners (radius 0)**, **1px grid borders**, **no shadows**, frosted-glass (`backdrop-filter: blur`) for sticky layers. Monospace for data/labels, geometric sans for reading. Restrained — semantic color only, no gradients/glows/emoji. Built for regulated-finance professionals, not a crypto startup.

## Colors (`:root`)
```css
:root{
  --bg:#0a0b0d; --bg-2:#0d0f12; --surface:#101317;
  --border:#1c1f26; --border-hi:#2a2e37;
  --text:#e7e9ec; --dim:#9aa0ab; --mute:#7c828c;
  --accent:oklch(76% 0.135 162);            /* bright cyan/teal */
  --accent-dim:oklch(60% 0.10 162);
  --accent-soft:color-mix(in oklch, var(--accent) 13%, transparent);
  --fail:oklch(66% 0.17 25);                /* red-orange — use for the forced-failure demo */
  --fail-soft:color-mix(in oklch, var(--fail) 14%, transparent);
  --warn:oklch(80% 0.12 85);
  --warn-soft:color-mix(in oklch, var(--warn) 14%, transparent);
}
```
Map persona colors onto this scale (don't invent new hues): Advisor=accent cyan, others differentiate with `--text`/`--dim` borders + small mono labels rather than rainbow fills, to keep the institutional restraint. (If distinct persona tints are needed for clarity, keep them muted and desaturated.)

## Typography
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
```css
--sans:"Archivo",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
--mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
```
Scale (app/dashboard context — between the docs pages and the deck):
- Page/section title: 40–50px, weight 700, letter-spacing −0.027em, line-height 1.05
- Card/panel heading: 24–27px, weight 600, letter-spacing −0.02em
- Body: 16–18px, line-height 1.5–1.62, color `--dim`
- Eyebrow / labels: 13–14px, **mono**, letter-spacing 0.16–0.24em, UPPERCASE, color `--mute`/`--accent`
- Stat numbers: 54px, weight 700, letter-spacing −0.03em
- Buttons / nav / status chips / table headers: 13–14px **mono**, letter-spacing 0.03–0.06em

## Components (verbatim patterns to reuse)
- **Button:** mono 14px, padding 13px 22px, `border:1px solid var(--accent-dim)`, `background:var(--accent-soft)`, `color:var(--accent)`; hover → `background:color-mix(in oklch,var(--accent) 20%,transparent)`, `border-color:var(--accent)`. Ghost variant: transparent bg, `--border-hi` border, `--dim` text.
- **Card:** flex column, gap 14px, padding 38px 34px, min-height 230px, hover `background:var(--surface)`. Accent card: `background:var(--accent-soft)`, `border-color:var(--accent-dim)`.
- **Status chip:** mono 12px, UPPERCASE, padding 4px 10px, `border:1px solid var(--border-hi)`. `.ok` → accent; `.tbd` → warn.
- **Callout:** `border:1px solid var(--accent-dim)`, `background:var(--accent-soft)`, padding 28px 32px; mono uppercase label in `--accent`, then `--text` body 21px.
- **Table.data:** `border-collapse:collapse`, 1px borders; mono uppercase headers in `--mute`; first column `--text`/500, rest `--dim`. Comparison cells: `.yes`→accent/600, `.no`→`--fail`.
- **Sticky topbar:** `position:sticky;top:0;background:color-mix(in oklch,var(--bg) 85%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)`.
- **Focus:** `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}` (cards use offset −2px). **Never remove focus rings.**

## Layout
- Containers: 1040–1120px max-width for reading; full-width grids for dashboards.
- Grids: `repeat(3,1fr)` cards/stats; label+content `230px 1fr`; use `border:1px solid var(--border);border-bottom:0` to avoid double borders.
- Spacing: 40px page edges, 28–36px inside cells, 72px section breaks, 14–24px small gaps.
- Transitions: 0.2s ease for most states, 0.35s for progress bars.

## Implementation notes
1. Keep `oklch()` accents (perceptually consistent).
2. Archivo + IBM Plex Mono are non-negotiable.
3. All borders 1px; all corners sharp (radius 0); no shadows.
4. Semantic color only: accent=primary/success, fail=error (forced-failure demo), warn=caution.
5. Fastest faithful start: copy the `<style>` block from `pitch/deck.html`, trim to what the app needs, extend with app components (persona panes, sealed-input rows, settlement legs, progress/atomic-close animation).
