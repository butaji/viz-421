# Task Plan

## Active Plan - Performance Optimization

- [x] Scope review: preserve the current dotted TRON-road look while reducing render, audio, and UI churn.
- [x] Render: cache resize-dependent gradients/scanlines and precompute lane lookup/color tables.
- [x] Data flow: replace row snapshot allocation + `unshift` churn with fixed-cap storage.
- [x] Runtime: throttle stats DOM writes, coalesce resize work, and trim overlay timer churn.
- [x] Lifecycle: skip avoidable work while the page is hidden without changing visible behavior.
- [x] Verification: sanity-check syntax and load through a local server; browser-side idle/live comparison still recommended for desktop/mobile sizing.

## Notes

- Concerns touched: rendering, audio input polling, UI copy/state, responsiveness, and performance.
- Visual guardrails: keep the dotted road geometry, glow layering, horizon feed cadence, and overall palette unchanged.
- Expected wins: lower per-frame allocation, fewer canvas state rebuilds, less DOM churn, and lower hidden-tab resource use.

## Review

- `index.html` now caches the background gradient, vignette, and scanline overlay and rebuilds them only on resize.
- Lane lookup tables now precompute normalized positions, midpoint positions, and RGB fill styles so the draw loop no longer allocates per-dot color arrays or rgba strings.
- Row history now uses fixed-cap typed-array storage instead of allocating a new snapshot object and `Float32Array` on every sample.
- The runtime now throttles microphone analyser reads and stats text writes, coalesces resize work through `requestAnimationFrame`, and uses a single overlay hide timer.
- The animation loop now skips work while the page is hidden and restores the overlay cleanly on resume.
- Verification completed with `node --check /tmp/viz421-script.js` after extracting the inline script and a local `python3 -m http.server 8123` fetch that returned `HTTP/1.0 200 OK` for `index.html`.
