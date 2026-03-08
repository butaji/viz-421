# Task Plan

## Active Plan - Center-Out Road Variant

- [x] Scope review: keep road mode unchanged and simplify the alternate view so it reuses the same row-history dynamics from the screen center to the borders.
- [x] Visual redesign: replace the current fractal shell behavior with a center-out radial road variant built from the same frozen snapshot rows.
- [x] Navigation: keep the existing hash-based mode syncing intact while changing only the alternate mode render path and copy.
- [x] Performance: preserve the lightweight draw loop by using fixed radial geometry and age-driven travel only.
- [x] Verification: sanity-check syntax, load through a local server, and compare road vs center-out mode plus hash-driven loading.

## Notes

- Concerns touched: rendering, motion direction, overlay state, responsiveness, and performance.
- Visual guardrails: road mode stays the default, the alternate mode uses the same dot/glow language, and every row starts at screen center before aging outward.
- Performance guardrails: reuse existing cached tables and row history, avoid per-frame allocations, and keep radial geometry simple and deterministic.

## Review

- The alternate view now behaves like a radial version of the road: each frozen snapshot row is projected from the screen center and travels outward to the borders using the same age-based motion curve.
- The previous fractal shell, echo, and wobble logic was removed in favor of simple deterministic radial dots, which eliminates shaking and keeps the motion readable as center-out travel.
- Dot glow, color mapping, snapshot cadence, and hash-based mode switching all stay intact, and the alternate mode is now named `Spacefall` in the UI and hash navigation.
- Performance stays lightweight by reusing cached trig tables and row history with one radial dot pass per sample instead of layered shell effects.
- New lessons were recorded in `tasks/lessons.md` to preserve the center-out road-variant interpretation and hash-backed mode behavior.
- Verification completed with `node --check /tmp/viz421-script.js` after extracting the inline script and a local `python3 -m http.server 8123` fetch for `index.html#mode=spacefall` that returned `HTTP/1.0 200 OK`.
