# VIZ421

![Dot Road spectrum preview](pics/p1.png)

VIZ421 is a browser-based microphone visualizer that turns live audio into a retro-futuristic dotted rainbow road. Development happens in `src/index.html`; the production artifact is the generated root `index.html`.

## What It Does

This project renders a TRON-meets-Rad-Racer visualizer using only native browser APIs.

- Every visible element is made from small glowing dots
- Color is mapped strictly from left to right across the screen
- The horizon acts as the live audio source
- Each sampled spectrum row is frozen, then moves forward through a perspective field
- Idle mode still animates with synthetic horizon snapshots when the mic is off

## Current Visual Direction

- Flat dotted retro road / perspective field
- Pure black and deep blue space backdrop
- Neon rainbow horizon source
- Small ASMR-like particles with subtle glow
- Chrome-friendly microphone-driven playback

## Tech

- HTML5
- CSS3
- JavaScript
- Canvas 2D API
- Web Audio API

## Run Locally

Microphone access is unreliable on `file://`, so run the page from a local server.

### Install dependencies

```bash
npm install
```

### Hot reload during development

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8080/src/
```

Vite reloads the browser automatically when `src/index.html` changes.

### Run the test suite

```bash
npm test
```

Vitest covers syntax, spectrum mapping, projection behavior, slow adaptation, room-noise suppression, and production build path checks.

### Preview the production build locally

```bash
npm run preview
```

### Build for production

```bash
npm run build
```

This writes a single production `./index.html` with no runtime dependencies. Edit `./src/index.html` during development.

## How To Use

1. Open the app in Chrome or another modern secure-context browser
2. Click `Start`
3. Allow microphone access
4. Speak or play audio near the microphone
5. Use `Stop` to release the mic
6. Use `Fullscreen` for the cleanest presentation

The control overlay auto-hides after mic start and reappears when you move the mouse.

## Project Structure

```text
.
├── index.html
├── README.md
├── AGENTS.md
├── src/
├── scripts/
├── tests/
└── tasks/
    ├── todo.md
    └── lessons.md
```

## Notes

- The editable app source lives in `src/index.html`
- `index.html` is the generated production file in `./`
- No external dependencies, no CDN assets, no frameworks
- Snapshot cadence, perspective, glow, and color behavior are easy to tweak from the config block in `src/index.html`
- The visualizer is currently tuned around Chrome behavior first

## Production Notes

- Host over `http://localhost` in development and HTTPS in production for reliable mic permissions
- Production deployment is `index.html`; keep `pics/` if you want social preview metadata images to resolve
- `file://` is not a supported production path for microphone use
- The visualizer is tuned and tested primarily on Chrome/Chromium-class browsers
- Use Node 20+ and a current npm for the documented dev/test/build workflow
- Keep the file single-page and lightweight unless there is a strong reason to split it
- If visual changes drift away from the road/snapshot concept, re-check the horizon sampling model before adding more effects

## Developer Diagnostics

- Capture a few rows in the browser console: `http://127.0.0.1:8080/src/?captureRows=1`
- Stream rows every 5 seconds in the browser console: `http://127.0.0.1:8080/src/?captureRows=stream`
- Captured rows are also stored on `window.__vizCapturedRows`

## Release Checklist

- Run `npm test`
- Run `npm run build`
- Serve the built app over HTTPS
- Verify mic permission flow, start/stop, fullscreen, and overlay readability
- Verify desktop and mobile sizing plus idle behavior with mic off

## License

Private project; add a license before public redistribution.
