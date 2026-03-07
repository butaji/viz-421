# Futuristic 3D Music Visualizer

A browser-based music visualizer that turns live microphone input into a neon sci-fi landscape with waveform hills, spiral spectrums, glowing particles, and cinematic light effects.

## Overview

This project is a single-page visual experiment built in plain HTML, CSS, and JavaScript. It uses the Canvas 2D API for rendering and the Web Audio API for real-time frequency analysis, then maps that audio energy into a stylized cosmic scene.

When the microphone is active, the visualizer reacts to sound with:

- layered waveform terrain
- a circular spiral spectrum
- glowing particle crests
- far-distance light towers
- star dust, halo bloom, and floor-grid depth cues
- live energy, punch, peak-frequency, and mode stats

## Features

- Single-file app with no build step
- Real-time microphone input analysis
- Responsive full-screen canvas layout
- Performance-aware rendering that adapts visual quality by frame timing
- Neon cyber-cosmic visual style with animated particles and chromatic glow
- Simple start/stop controls with live status messaging

## Tech

- HTML5
- CSS3
- JavaScript
- Canvas 2D API
- Web Audio API

## Getting Started

Because browser microphone access is unreliable on `file://`, run the project from a local server.

### Option 1: Python

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### Option 2: Node

```bash
npx serve .
```

Open the local URL shown in the terminal.

## How To Use

1. Open the app in a modern desktop or mobile browser.
2. Click `Start mic`.
3. Allow microphone access when prompted.
4. Speak, play music nearby, or feed audio into your microphone.
5. Click `Stop` to pause the visualizer.

## Project Structure

```text
.
├── index.html
├── README.md
├── AGENTS.md
└── tasks/
    ├── todo.md
    └── lessons.md
```

## Notes

- The visualizer is intentionally kept lightweight and lives entirely in `index.html`.
- Audio reactivity is driven by analyser frequency data and smoothed energy bands.
- Rendering quality scales dynamically to help maintain performance across devices.
- Best results come from Chromium-based browsers or Safari with microphone permissions enabled.

## Customization Ideas

- Tune the color palette for a different mood
- Adjust analyser settings for sharper or smoother response
- Change particle density and grid depth for performance or style
- Swap the UI copy and overlay styling for a different presentation

## License

Add your preferred license here.
