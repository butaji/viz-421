# AGENTS.md

This project is a single-page, browser-based music visualizer developed in `src/index.html` and built to a production root `index.html`. It uses the Canvas 2D API, the Web Audio API, and microphone input to render a dotted retro-futuristic road where horizon spectrum snapshots travel toward the viewer in a TRON-meets-Rad-Racer style. Keep changes lightweight, readable, and performance-aware.

### 1. Plan Mode Default
- Enter plan mode for any non-trivial change, especially anything that affects audio analysis, render performance, UI structure, or microphone flow.
- Write the plan in `tasks/todo.md` before making code changes.
- If rendering quality, responsiveness, or audio behavior drifts during implementation, stop and re-plan instead of layering hacks.
- Prefer small specs with explicit notes about visuals, performance impact, and verification steps.

### 2. Subagent Strategy To Keep Main Context Window Clean
- Offload exploration and broad code analysis to subagents when the task touches multiple concerns.
- Use one subagent for one concern at a time, such as render pipeline review, audio mapping review, or UX copy review.
- Keep the main thread focused on implementation decisions inside `src/index.html` unless the project structure grows.

### 3. Self-Improvement Loop
- After any user correction, record the lesson in `tasks/lessons.md`.
- Capture the concrete mistake pattern and the rule that prevents it next time.
- Review relevant lessons before changing visuals, interactivity, copy, or performance-sensitive code.
- Prefer repeatable rules tied to this project, such as microphone permission handling, mobile canvas behavior, or keeping the aesthetic consistent.

### 4. Verification Before Done
- Never mark work done without verifying it against how this visualizer actually behaves.
- For UI or animation changes, verify desktop and mobile sizing, overlay readability, and whether the road perspective, horizon source, and dot-only look still feel intentional.
- For audio changes, verify start/stop flow, permission failure messaging, stats updates, and that animation still idles cleanly when audio is off.
- When relevant, compare behavior before and after the change, especially frame pacing, particle density, and responsiveness to sound.
- Use a local server for browser testing because microphone access is unreliable on `file://`.

### 5. Demand Elegance (Balanced)
- Favor simple, contained edits inside the existing single-file architecture unless there is a strong reason to split code out.
- Keep rendering code clear: extract helper functions only when they genuinely reduce repetition or make math easier to reason about.
- Keep functions small: target 20 lines max per function unless there is a strong, documented reason not to.
- Prefer declarative style and function chains over long imperative blocks when shaping data, render inputs, and UI state.
- Do not add generic UI chrome, unnecessary controls, or visual clutter that weakens the current cinematic look.
- If a fix feels patchy, step back and choose the cleaner approach for the render loop, audio data mapping, or DOM overlay.

### 6. Autonomous Bug Fixing
- When a bug is reported, reproduce it from the current `src/index.html` behavior and fix the root cause.
- Focus first on the likely failure areas: microphone initialization, analyser configuration, canvas resize logic, performance throttling, and draw-order issues.
- Use errors, visible regressions, and broken interaction states as signals to investigate, not reasons to ask the user to debug for you.
- Keep fixes minimal and safe so the visual style and motion language remain intact.

### 7. Performance And Resource Use
- Treat performance and resource consumption as a first-class requirement on every task, not only explicit optimization work.
- Consider CPU cost, memory churn, animation-frame budget, and audio-analysis overhead before adding logic or effects.
- Prefer approaches that avoid per-frame allocations, redundant passes, and expensive recalculation when a cached or simpler option will work.
- If a change improves visuals or behavior but risks heavier runtime cost, choose the lighter implementation unless there is a strong reason not to.

### 8. Test-Driven Development
- Use TDD for features, bug fixes, and behavior changes: write the failing test first, verify the failure, then implement the minimal code change to make it pass.
- Add regression tests for reported visual or audio issues before adjusting the implementation.
- Keep tests focused on observable behavior and project-specific expectations instead of implementation trivia.
- Re-run the relevant tests after each change and keep the full suite green before considering the task done.

## Task Management
1. **Plan First**: Write checkable items to `tasks/todo.md` for non-trivial work.
2. **Track Scope**: Note whether the task touches audio input, rendering, UI copy, responsiveness, or performance.
3. **Update Progress**: Mark items complete as soon as they are verified.
4. **Explain Changes**: Record a brief implementation note and verification note in `tasks/todo.md`.
5. **Capture Lessons**: Add durable corrections to `tasks/lessons.md` after user feedback.

## Project-Specific Principles
- **Single-File Discipline**: Preserve the lightweight nature of the project; avoid adding tooling or structure unless the task clearly needs it.
- **Performance First**: Treat every new effect as a frame-budget decision, especially in the main draw loop.
- **Audio Reactivity Over Noise**: Visual changes should feel tied to energy, punch, and frequency content rather than random motion.
- **Intentional Aesthetic**: Preserve the dotted TRON-racer direction; new visuals should reinforce the horizon-to-viewer road feed instead of drifting back toward generic terrain.
- **Responsive By Default**: Ensure the overlay and canvas still work cleanly across desktop and mobile.
- **Minimal Impact**: Change only what is necessary and avoid regressions in start/stop behavior or idle state rendering.
