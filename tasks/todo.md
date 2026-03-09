# Task Plan

## Active Plan - Dev/Test/Build Tooling

- [x] Scope review: add lightweight tooling for browser hot reload, automated tests, and a production build while keeping the single-file app workflow simple.
- [x] Development workflow: add a local dev server command with live reload on `http://localhost:8080/src/` for `src/index.html` changes.
- [x] Test/build workflow: add a broader automated test suite plus a production build step that emits a deployable single `./index.html` with no runtime dependencies.
- [x] Verification: install dependencies, run the tests, run the build, and confirm the dev server command is ready to use.

## Active Plan - Right-Side Flattening Regression

- [x] Scope review: reproduce the remaining spectrum-occupancy issue where red/purple stays flat and green/blue rarely reaches the ground while keeping X positions fixed.
- [x] Test first: add failing regression tests for weak right-tail spread and insufficient low/mid occupancy depth.
- [x] Minimal fix: adjust fixed-X sensitivity scaling so both the red/purple tail and the green/blue body use more of the existing vertical range without remapping particles.
- [x] Verification: run tests and the production build, then record the implementation and lesson notes.

## Active Plan - Dev Console Capture

- [x] Scope review: add a dev-only way to dump captured spectrum rows in the browser console without affecting production behavior.
- [x] Test first: add a failing test for the dev-capture gate and row formatting helper before implementation.
- [x] Minimal fix: implement a localhost/hash-gated console capture path in `src/index.html` that logs a few full rows and compact samples.
- [x] Verification: run tests and the production build, then note how to trigger the capture in development.

## Active Plan - Stale-Noise Damping

- [x] Scope review: reduce sensitivity for persistent low-variation bands while keeping full-spectrum projection and slow adaptation intact.
- [x] Test first: add failing regression tests for stale-band damping and slow recovery when variation returns.
- [x] Minimal fix: implement slow per-band staleness tracking in `src/index.html` and fold it into amplitude sensitivity only.
- [x] Verification: run tests and the production build, then record the behavior and usage notes.

## Active Plan - Continuous Dev Capture Stream

- [x] Scope review: provide continuous browser-console spectrum output in dev mode without affecting production behavior.
- [x] Test first: add a failing test for dev capture stream mode detection and gating.
- [x] Minimal fix: implement a localhost-only `captureRows=stream` mode that logs rows continuously.
- [x] Verification: run tests and the production build, then document how to use the stream URL.

## Active Plan - ASMR Background + Release Readiness

- [x] Scope review: add a very subtle dark background gradient that slowly follows dominant spectrum colors without overpowering the road.
- [x] Test first: add failing tests for dominant-color extraction and dark background tinting before implementation.
- [x] Visual fix: implement slow ASMR-style background color easing that stays in the current dark palette and remains performance-light.
- [x] Docs/perf pass: use agents to tighten production docs and review performance/resource usage before release.
- [x] Verification: run full tests, build the production `./index.html`, and create the requested git commit.

## Notes

- Concerns touched: audio input, rendering, and performance.
- Visual guardrails: preserve the same road framing, dot-only language, and horizon-to-viewer motion.
- Performance guardrails: reuse typed arrays, avoid per-frame allocations, and keep lane sampling lightweight.

## Review

- Development now lives in `src/index.html`, Vite serves it with hot reload at `http://127.0.0.1:8080/src/`, and the production build writes a single minified `./index.html` from that source.
- The test suite now covers the source shell, inline script syntax, helper math, palette/rgb logic, band mapping, adaptive scaling behavior, anchor updates, and production path rewriting.
- Added a left-side flattening regression test so low-band sensitivity scaling must preserve visible variation instead of compressing neighboring low values into nearly the same output.
- `src/index.html` now applies a softer low-side floor before normalization, which keeps fixed X positions intact while restoring contrast on the left.
- Added right-edge and whole-spectrum spread regression tests plus a slow-adaptation test, so both low and high ends now have to preserve visible variation without dead flat zones while still rescaling gradually over time.
- `src/index.html` now softens normalization floors at both spectrum edges and gives each edge a small extra sensitivity blend, which keeps X positions fixed while improving spread on the red/purple side too.
- Added stronger occupancy tests for the green/blue body and the red/purple tail, so the visualizer has to use more of the available vertical range across the full left-to-right spectrum instead of only fixing edge contrast in isolation.
- `src/index.html` now adds a modest body gain for the green/blue range and a stronger boosted normalized response toward the red/purple tail, while keeping the adaptation slow and X positions fixed.
- Reworked the scaler toward a slower whole-spectrum model with low/mid/high envelopes instead of only edge-local shaping, so the visualizer aligns the full incoming spectrum to the same vertical language more coherently over time.
- Added deeper occupancy tests for the far-right tail and the green/blue body, which now force the scaler to lift weak high-end activity and use more of the middle range without remapping X.
- Added a dev-only row capture path gated to localhost plus `captureRows` in the URL, which logs a few full captured rows to the browser console and stores them in `window.__vizCapturedRows` for fixture collection.
- Added real captured-row fixtures, including quieter rows, so the spectrum scaling tests now cover full-spectrum projection, weak-tail preservation, and stable quiet behavior using microphone data instead of only synthetic assumptions.
- `src/index.html` now adds slow stale-noise damping for bands that sit at nearly constant intensity too long, which helps persistent plateaus give up sensitivity without causing fast jumps when variation returns.
- `src/index.html` now derives a very subtle dark background tint from dominant spectrum colors and eases it slowly, which adds ASMR-style atmosphere without competing with the road.
- Production docs were tightened to reflect the real `src/index.html` -> `./index.html` workflow, release checklist, browser/runtime expectations, and dev diagnostics, and a small render-loop cleanup replaced `stars.forEach()` with a plain loop.
- The production build stays dependency-free at runtime because `scripts/build-prod.mjs` minifies `src/index.html` into a standalone root `index.html` and rewrites asset paths from `../pics/` to `pics/`.
- Verification completed with `npm test`, `npm run build`, and a Vite smoke check returning `HTTP/1.1 200 OK` from `http://127.0.0.1:8080/src/`.

## Previous Plan - Center-Out Road Variant

- [x] Scope review: keep road mode unchanged and simplify the alternate view so it reuses the same row-history dynamics from the screen center to the borders.
- [x] Visual redesign: replace the current fractal shell behavior with a center-out radial road variant built from the same frozen snapshot rows.
- [x] Navigation: keep the existing hash-based mode syncing intact while changing only the alternate mode render path and copy.
- [x] Performance: preserve the lightweight draw loop by using fixed radial geometry and age-driven travel only.
- [x] Verification: sanity-check syntax, load through a local server, and compare road vs center-out mode plus hash-driven loading.

## Previous Notes

- Concerns touched: rendering, motion direction, overlay state, responsiveness, and performance.
- Visual guardrails: road mode stays the default, the alternate mode uses the same dot/glow language, and every row starts at screen center before aging outward.
- Performance guardrails: reuse existing cached tables and row history, avoid per-frame allocations, and keep radial geometry simple and deterministic.

## Previous Review

- The alternate view now behaves like a radial version of the road: each frozen snapshot row is projected from the screen center and travels outward to the borders using the same age-based motion curve.
- The previous fractal shell, echo, and wobble logic was removed in favor of simple deterministic radial dots, which eliminates shaking and keeps the motion readable as center-out travel.
- Dot glow, color mapping, snapshot cadence, and hash-based mode switching all stay intact, and the alternate mode is now named `Spacefall` in the UI and hash navigation.
- Performance stays lightweight by reusing cached trig tables and row history with one radial dot pass per sample instead of layered shell effects.
- New lessons were recorded in `tasks/lessons.md` to preserve the center-out road-variant interpretation and hash-backed mode behavior.
- Verification completed with `node --check /tmp/viz421-script.js` after extracting the inline script and a local `python3 -m http.server 8123` fetch for `index.html#mode=spacefall` that returned `HTTP/1.0 200 OK`.
