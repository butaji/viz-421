import { CONFIG, VIEW_MODES, FRACTAL, MAX_ROWS, STAR_FILL, WHITE_FILL } from './config.js'
import { clamp, mix, smoothstep, wrappedPeak } from './math.js'
import { palette, rgb, mixColor, dominantSpectrumColor, tintBackgroundColor } from './color.js'

export function bootVisualizer() {
            const canvas = document.getElementById('scene');
            const ctx = canvas.getContext('2d');
            const ui = document.getElementById('ui');
            const toggleAudioBtn = document.getElementById('toggle-audio');
            const toggleViewBtn = document.getElementById('toggle-view');
            const fullscreenBtn = document.getElementById('fullscreen');
            const msg = document.getElementById('msg');
            const energyEl = document.getElementById('energy');
            const punchEl = document.getElementById('punch');
            const peakEl = document.getElementById('peak');
            const modeEl = document.getElementById('mode');

            const smoothed = new Float32Array(CONFIG.spectrumSize);
            const bandFlux = new Float32Array(CONFIG.spectrumSize);
            const bandStaleness = new Float32Array(CONFIG.spectrumSize);
            const bandNoiseFloor = new Float32Array(CONFIG.spectrumSize);
            const projectedSpectrum = new Float32Array(CONFIG.laneCount);
            const projectedSpectrumFloor = new Float32Array(CONFIG.laneCount);
            const stars = [];
            const rowValues = Array.from({ length: MAX_ROWS }, () => new Float32Array(CONFIG.laneCount));
            const rowAges = new Float32Array(MAX_ROWS);
            const laneUs = new Float32Array(CONFIG.laneCount);
            const laneCenters = new Float32Array(CONFIG.laneCount);
            const laneSpectrumIndex = new Uint16Array(CONFIG.laneCount);
            const midLaneCenters = new Float32Array(Math.max(0, CONFIG.laneCount - 1));
            const laneFillStyles = new Array(CONFIG.laneCount);
            const midLaneFillStyles = new Array(Math.max(0, CONFIG.laneCount - 1));
            const fractalCos = new Float32Array(FRACTAL.sampleCount);
            const fractalSin = new Float32Array(FRACTAL.sampleCount);

            let width = 0;
            let height = 0;
            let dpr = 1;
            let horizonY = 0;
            let centerX = 0;
            let centerY = 0;
            let horizonHalfWidth = 0;
            let bottomY = 0;
            let topFadeMinY = 0;
            let topFadeMaxY = 0;
            let backgroundGradient = null;
            let vignetteGradient = null;
            const backgroundAccent = new Float32Array([0.04, 0.08, 0.16]);
            let scanlineCanvas = null;
            let keepAwakeMedia = null;
            let audioContext = null;
            let analyser = null;
            let stream = null;
            let freqData = null;
            let bandStarts = new Uint16Array(0);
            let bandEnds = new Uint16Array(0);
            let lastFrame = 0;
            let sampleClock = 0;
            let audioPollClock = 0;
            let statsClock = 0;
            let overlayHideTimer = 0;
            let resizeRaf = 0;
            let rowHead = -1;
            let rowCount = 0;
            let isPageVisible = !document.hidden;
            let viewModeIndex = 0;
            let energy = 0;
            let punch = 0;
            let bass = 0;
            let dominantHz = 0;
            let lowBandFloor = 0.06;
            let lowBandCeiling = 0.24;
            let midBandFloor = 0.045;
            let midBandCeiling = 0.18;
            let highBandFloor = 0.035;
            let highBandCeiling = 0.14;
            let activeSpectrumStart = 0;
            let activeSpectrumEnd = CONFIG.spectrumSize - 1;
            let devCapturedRowCount = 0;
            let lastDevCaptureLogAt = -Infinity;
            function keepAwakeMediaSrc() {
                return 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
            }

            function updateBackgroundAccent(values) {
                const target = tintBackgroundColor(dominantSpectrumColor(values), CONFIG.backgroundTintStrength);
                for (let i = 0; i < 3; i++) backgroundAccent[i] = mix(backgroundAccent[i], target[i], CONFIG.backgroundColorEase);
                rebuildBackgroundGradients();
            }

            function shapeBandLevel(avg, peak, t) {
                const detail = mix(avg, peak, 0.2 + 0.45 * t);
                const lifted = Math.pow(detail, 0.86);
                const gain = mix(1, CONFIG.spectrumLift, Math.pow(t, 1.18));
                return clamp(lifted * gain, 0, 1);
            }

            function devCaptureMode() {
                const { hostname = '', search = '', hash = '' } = window.location || {};
                const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';
                if (!isLocal) return 'off';
                const flags = `${search}${hash}`;
                if (/captureRows=stream|capture=stream/.test(flags)) return 'stream';
                if (/captureRows=1|capture=1|captureRows|capture/.test(flags)) return 'sample';
                return 'off';
            }

            function shouldCaptureDevRows() {
                return devCaptureMode() !== 'off';
            }

            function shouldLogDevCaptureStream(now) {
                if (now - lastDevCaptureLogAt < CONFIG.devCaptureStreamMs) return false;
                lastDevCaptureLogAt = now;
                return true;
            }

            function formatCapturedRow(values, label = 'row') {
                const every = Math.max(1, Math.floor(values.length / 32));
                const sample32 = [];
                for (let i = 0; i < values.length && sample32.length < 32; i += every) {
                    sample32.push(Number(values[i].toFixed(4)));
                }
                return {
                    label,
                    values: Array.from(values, (value) => Number(value.toFixed(6))),
                    sample32,
                };
            }

            function maybeCaptureDevRow(values, now) {
                const mode = devCaptureMode();
                if (mode === 'off' || !analyser) return;
                if (mode === 'stream' && !shouldLogDevCaptureStream(now)) return;
                if (mode !== 'stream' && devCapturedRowCount >= CONFIG.devCaptureRows) return;
                const row = formatCapturedRow(values, `row-${devCapturedRowCount + 1}`);
                devCapturedRowCount++;
                window.__vizCapturedRows = window.__vizCapturedRows || [];
                window.__vizCapturedRows.push(row);
                console.log('[viz-row-capture]', JSON.stringify(row));
            }

            function isAppleTabletDevice() {
                const { userAgent = '', platform = '', maxTouchPoints = 0 } = navigator || {};
                if (/iPad/i.test(userAgent) || /iPad/i.test(platform)) return true;
                return /Mac/i.test(platform) && maxTouchPoints > 1;
            }

            function isFullscreenMode() {
                if (document.fullscreenElement) return true;
                if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
                return Boolean(window.navigator && window.navigator.standalone);
            }

            function shouldRunKeepAwakeMedia() {
                return !document.hidden && isAppleTabletDevice() && isFullscreenMode();
            }

            function ensureKeepAwakeMedia() {
                if (keepAwakeMedia) return keepAwakeMedia;
                const media = document.createElement('audio');
                media.src = keepAwakeMediaSrc();
                media.loop = true;
                media.preload = 'auto';
                media.volume = 0.001;
                media.playsInline = true;
                media.setAttribute('playsinline', '');
                media.setAttribute('webkit-playsinline', '');
                media.setAttribute('aria-hidden', 'true');
                media.style.display = 'none';
                document.body.appendChild(media);
                keepAwakeMedia = media;
                return media;
            }

            async function startKeepAwakeMedia() {
                if (!shouldRunKeepAwakeMedia()) return;
                const media = ensureKeepAwakeMedia();
                if (!media.paused) return;
                try {
                    media.currentTime = 0;
                    await media.play();
                } catch (error) {
                    console.debug('Keep-awake media could not start yet.', error);
                }
            }

            function stopKeepAwakeMedia() {
                if (!keepAwakeMedia) return;
                keepAwakeMedia.pause();
                keepAwakeMedia.currentTime = 0;
            }

            function syncKeepAwakeMedia() {
                if (shouldRunKeepAwakeMedia()) startKeepAwakeMedia();
                else stopKeepAwakeMedia();
            }

            function applyBandSensitivity(value, index) {
                const localNoiseFloor = typeof noiseFloorFor === 'function' ? noiseFloorFor(index) : 0;
                const filtered = Math.max(0, value - localNoiseFloor);
                const t = index / Math.max(1, CONFIG.spectrumSize - 1);
                const floor = spectrumFloorFor(t);
                const ceiling = spectrumCeilingFor(t);
                const edgeWeight = Math.pow(Math.abs(t - 0.5) * 2, 0.78);
                const rightTailFloor = mix(1, 0.24, smoothstep(0.72, 0.98, t));
                const adjustedFloor = floor * mix(1, 0.08, edgeWeight) * rightTailFloor;
                const span = Math.max(0.032, ceiling - adjustedFloor);
                const normalized = Math.pow(clamp((filtered - adjustedFloor) / span, 0, 1), CONFIG.sensitivityGamma);
                const bodyBoost = 0.56 * smoothstep(0.12, 0.34, t) * (1 - smoothstep(0.34, 0.62, t));
                const tailBoost = 0.58 * smoothstep(0.72, 0.98, t);
                const boosted = clamp(normalized * (1 + bodyBoost + tailBoost), 0, 1);
                const edgeBoost = 0.08 * smoothstep(0.42, 1, edgeWeight);
                const leftBoost = 0.08 * smoothstep(0.56, 0.95, 1 - t);
                const rightBoost = CONFIG.sensitivityRightBoost * smoothstep(0.6, 0.98, t) + 0.12 * smoothstep(0.78, 0.99, t);
                const blend = CONFIG.sensitivityBlend + edgeBoost + leftBoost + rightBoost;
                const scaled = mix(filtered, boosted, blend) * stalenessDampingFor(index);
                return clamp(scaled, 0, 1);
            }

            function updateBandNoiseFloor() {
                for (let i = 0; i < CONFIG.spectrumSize; i++) {
                    const steadiness = 1 - clamp(bandFlux[i] / CONFIG.noiseFluxThreshold, 0, 1);
                    const target = smoothed[i] * CONFIG.noiseFloorStrength * steadiness;
                    const rate = target > bandNoiseFloor[i] ? CONFIG.noiseFloorRise : CONFIG.noiseFloorFall;
                    bandNoiseFloor[i] = mix(bandNoiseFloor[i], target, rate);
                }
            }

            function noiseFloorFor(index) {
                return bandNoiseFloor[index];
            }

            function updateBandStaleness() {
                for (let i = 0; i < CONFIG.spectrumSize; i++) {
                    const target = bandFlux[i] < CONFIG.staleFluxThreshold ? 1 : 0;
                    const rate = target ? CONFIG.staleAttack : CONFIG.staleRelease;
                    bandStaleness[i] = mix(bandStaleness[i], target, rate);
                }
            }

            function stalenessDampingFor(index) {
                return 1 - bandStaleness[index] * CONFIG.staleMaxDamping;
            }

            function sampleSpectrumValue(values, position) {
                const lo = clamp(Math.floor(position), 0, values.length - 1);
                const hi = clamp(lo + 1, 0, values.length - 1);
                const blend = clamp(position - lo, 0, 1);
                return mix(values[lo], values[hi], blend);
            }

            function sampleProjectedSpectrum(values, t) {
                const center = t * (values.length - 1);
                const radius = 1.2 + smoothstep(0.68, 1, t) * 14;
                const lookAhead = smoothstep(0.7, 1, t) * radius;
                let total = 0;
                let weightTotal = 0;
                let peak = 0;
                for (let offset = -Math.ceil(radius); offset <= Math.ceil(radius); offset++) {
                    const position = center + offset + lookAhead;
                    const distance = Math.abs(offset) / radius;
                    const forwardBias = offset > 0 ? 1.3 : 0.78;
                    const weight = Math.max(0, 1 - distance * distance) * forwardBias;
                    if (!weight) continue;
                    const sample = sampleSpectrumValue(values, position);
                    total += sample * weight;
                    weightTotal += weight;
                    peak = Math.max(peak, sample);
                }
                const average = total / Math.max(0.0001, weightTotal);
                const tailPeakBlend = smoothstep(0.76, 1, t) * 0.48;
                return mix(average, peak, tailPeakBlend);
            }

            function projectSpectrumRow(values) {
                const output = typeof projectedSpectrum !== 'undefined'
                    ? projectedSpectrum
                    : new Float32Array(CONFIG.laneCount);
                for (let i = 0; i < CONFIG.laneCount; i++) {
                    const t = i / Math.max(1, CONFIG.laneCount - 1);
                    output[i] = applyBandSensitivity(sampleProjectedSpectrum(values, t), Math.round(t * (CONFIG.spectrumSize - 1)));
                }
                applyProjectionFloor(output);
                return output;
            }

            function applyProjectionFloor(values) {
                const floorBuffer = typeof projectedSpectrumFloor !== 'undefined'
                    ? projectedSpectrumFloor
                    : new Float32Array(CONFIG.laneCount);
                let rowPeak = 0;
                for (let i = 0; i < CONFIG.laneCount; i++) rowPeak = Math.max(rowPeak, values[i]);
                const quietBridge = 1 - smoothstep(0.08, 0.32, rowPeak);
                for (let i = 0; i < CONFIG.laneCount; i++) {
                    const t = i / Math.max(1, CONFIG.laneCount - 1);
                    const radius = Math.round(mix(4, 9, Math.pow(Math.abs(t - 0.5) * 2, 0.85)));
                    let total = 0;
                    let weightTotal = 0;
                    let peak = 0;
                    for (let offset = -radius; offset <= radius; offset++) {
                        const index = clamp(i + offset, 0, CONFIG.laneCount - 1);
                        const distance = Math.abs(offset) / Math.max(1, radius);
                        const weight = Math.max(0, 1 - distance * distance);
                        const sample = values[index];
                        total += sample * weight;
                        weightTotal += weight;
                        peak = Math.max(peak, sample);
                    }
                    const average = total / Math.max(0.0001, weightTotal);
                    const edgeStrength = Math.pow(Math.abs(t - 0.5) * 2, 0.75);
                    const leftEdgeBoost = 0.05 * smoothstep(0.5, 1, 1 - t);
                    const rightEdgeBoost = 0.08 * smoothstep(0.72, 1, t);
                    const floorMix = mix(0.17, 0.31, edgeStrength) + leftEdgeBoost + rightEdgeBoost;
                    const localFloor = mix(average, peak, 0.45) * floorMix;
                    const globalBridge = rowPeak * edgeStrength * quietBridge * 0.42;
                    floorBuffer[i] = Math.max(values[i], localFloor, globalBridge);
                }
                let carry = 0;
                for (let i = 0; i < CONFIG.laneCount; i++) {
                    const t = i / Math.max(1, CONFIG.laneCount - 1);
                    const edgeCarry = smoothstep(0.72, 1, t) * 0.38;
                    carry = Math.max(floorBuffer[i], carry * 0.965);
                    floorBuffer[i] = Math.max(floorBuffer[i], carry * edgeCarry);
                }
                carry = 0;
                for (let i = CONFIG.laneCount - 1; i >= 0; i--) {
                    const t = i / Math.max(1, CONFIG.laneCount - 1);
                    const edgeCarry = smoothstep(0.72, 1, 1 - t) * 0.3;
                    carry = Math.max(floorBuffer[i], carry * 0.965);
                    floorBuffer[i] = Math.max(floorBuffer[i], carry * edgeCarry);
                }
                values.set(floorBuffer);
            }

            function remapSpectrumRow(values, start, end, count) {
                const output = new Float32Array(count);
                for (let i = 0; i < count; i++) {
                    const t = i / Math.max(1, count - 1);
                    output[i] = sampleSpectrumValue(values, mix(start, end, t));
                }
                return output;
            }

            function findActiveSpectrumBounds(values) {
                const lastIndex = values.length - 1;
                let peak = 0;
                for (let i = 0; i < values.length; i++) peak = Math.max(peak, values[i]);
                if (peak <= CONFIG.sensitivityFloor * 3) return [0, lastIndex];
                const threshold = Math.max(CONFIG.sensitivityFloor, peak * CONFIG.activeRangeThreshold);
                let start = 0;
                let end = lastIndex;
                while (start < values.length - 1 && values[start] < threshold) start++;
                while (end > start && values[end] < threshold) end--;
                start = Math.max(0, start - CONFIG.activeRangePadding);
                end = Math.min(lastIndex, end + CONFIG.activeRangePadding);
                const span = end - start;
                if (span < CONFIG.activeRangeMinSpan) {
                    const half = CONFIG.activeRangeMinSpan * 0.5;
                    const center = (start + end) * 0.5;
                    start = Math.max(0, Math.round(center - half));
                    end = Math.min(lastIndex, Math.round(center + half));
                }
                return [0, Math.max(end, lastIndex)];
            }

            function updateActiveSpectrumRange(values) {
                const [targetStart, targetEnd] = findActiveSpectrumBounds(values);
                activeSpectrumStart = mix(activeSpectrumStart, targetStart, CONFIG.activeRangeEase);
                activeSpectrumEnd = mix(activeSpectrumEnd, targetEnd, CONFIG.activeRangeEase);
            }

            function spectrumTriplet(low, mid, high, t) {
                const center = CONFIG.midBandCenter;
                if (t <= center) return mix(low, mid, smoothstep(0, center, t));
                return mix(mid, high, smoothstep(center, 1, t));
            }

            function spectrumFloorFor(t) {
                return Math.max(CONFIG.sensitivityFloor, spectrumTriplet(lowBandFloor, midBandFloor, highBandFloor, t));
            }

            function spectrumCeilingFor(t) {
                return Math.max(CONFIG.sensitivityFloor, spectrumTriplet(lowBandCeiling, midBandCeiling, highBandCeiling, t));
            }

            function laneU(i) {
                return i / Math.max(1, CONFIG.laneCount - 1);
            }

            function applyResize() {
                const nextDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5));
                const nextWidth = window.innerWidth;
                const nextHeight = window.innerHeight;
                if (nextDpr === dpr && nextWidth === width && nextHeight === height) return;
                dpr = nextDpr;
                width = nextWidth;
                height = nextHeight;
                canvas.width = Math.floor(width * dpr);
                canvas.height = Math.floor(height * dpr);
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                horizonY = height * CONFIG.horizonY;
                buildLaneTables();
                buildRenderCaches();
                initStars();
            }

            function scheduleResize() {
                if (resizeRaf) return;
                resizeRaf = window.requestAnimationFrame(() => {
                    resizeRaf = 0;
                    applyResize();
                });
            }

            function buildLaneTables() {
                for (let i = 0; i < CONFIG.laneCount; i++) {
                    const u = laneU(i);
                    laneUs[i] = u;
                    laneCenters[i] = u * 2 - 1;
                    laneSpectrumIndex[i] = Math.floor(u * (CONFIG.spectrumSize - 1));
                    laneFillStyles[i] = rgb(palette(u));
                    if (i < CONFIG.laneCount - 1) {
                        const midU = (u + laneU(i + 1)) * 0.5;
                        midLaneCenters[i] = midU * 2 - 1;
                        midLaneFillStyles[i] = rgb(palette(midU));
                    }
                }
            }

            function buildRenderCaches() {
                centerX = width * 0.5;
                centerY = height * 0.5;
                horizonHalfWidth = width * CONFIG.horizonWidth * 0.5;
                bottomY = height * (1 + CONFIG.bottomOverscan);
                topFadeMinY = 0.16 * height;
                topFadeMaxY = 0.34 * height;

                rebuildBackgroundGradients();

                scanlineCanvas = document.createElement('canvas');
                scanlineCanvas.width = Math.max(1, width);
                scanlineCanvas.height = Math.max(1, height);
                const scanCtx = scanlineCanvas.getContext('2d');
                scanCtx.fillStyle = `rgba(255,255,255,${CONFIG.scanlineAlpha})`;
                for (let y = 0; y < height; y += 4) scanCtx.fillRect(0, y, width, 1);
                buildFractalTables();
            }

            function rebuildBackgroundGradients() {
                backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
                backgroundGradient.addColorStop(0, rgb(mixColor([0.043, 0.102, 0.204], backgroundAccent, 0.52)));
                backgroundGradient.addColorStop(0.34, rgb(mixColor([0.024, 0.043, 0.086], backgroundAccent, 0.32)));
                backgroundGradient.addColorStop(0.58, rgb(mixColor([0.008, 0.008, 0.028], backgroundAccent, 0.18)));
                backgroundGradient.addColorStop(1, '#000');

                vignetteGradient = ctx.createRadialGradient(centerX, height * 0.58, width * 0.2, centerX, height * 0.58, width * 0.78);
                vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
                vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.46)');
            }

            function buildFractalTables() {
                for (let i = 0; i < FRACTAL.sampleCount; i++) {
                    const angle = (i / FRACTAL.sampleCount) * Math.PI * 2;
                    fractalCos[i] = Math.cos(angle);
                    fractalSin[i] = Math.sin(angle);
                }
            }

            function initStars() {
                stars.length = 0;
                for (let i = 0; i < CONFIG.starCount; i++) stars.push(makeStar());
            }

            function makeStar() {
                return {
                    x: Math.random() * width,
                    y: Math.random() * horizonY * 0.94,
                    a: 0.08 + Math.random() * 0.34,
                    s: 0.4 + Math.random() * 0.8
                };
            }

            function buildBandMap() {
                if (!audioContext || !freqData) return;
                const nyquist = audioContext.sampleRate / 2;
                bandStarts = new Uint16Array(CONFIG.spectrumSize);
                bandEnds = new Uint16Array(CONFIG.spectrumSize);
                for (let i = 0; i < CONFIG.spectrumSize; i++) {
                    const [start, end] = bandBounds(i, nyquist);
                    bandStarts[i] = start;
                    bandEnds[i] = end;
                }
            }

            function bandHz(i) {
                const t = i / Math.max(1, CONFIG.spectrumSize - 1);
                const curved = Math.pow(t, CONFIG.spectrumCurve);
                return 24 * Math.pow(17000 / 24, curved);
            }

            function bandIndex(i, nyquist) {
                const hz = bandHz(i);
                const bin = Math.round((hz / nyquist) * (freqData.length - 1));
                return clamp(bin, 0, freqData.length - 1);
            }

            function bandBounds(i, nyquist) {
                const center = bandHz(i);
                const prev = i ? bandHz(i - 1) : center;
                const next = i < CONFIG.spectrumSize - 1 ? bandHz(i + 1) : center;
                const lowHz = i ? Math.sqrt(prev * center) : 0;
                const highHz = i === CONFIG.spectrumSize - 1 ? nyquist : Math.sqrt(center * next);
                const start = Math.floor((lowHz / nyquist) * (freqData.length - 1));
                const end = Math.ceil((highHz / nyquist) * (freqData.length - 1));
                return [clamp(start, 0, freqData.length - 1), clamp(end, 0, freqData.length - 1)];
            }

            function readBandLevel(i) {
                const start = bandStarts[i];
                const end = bandEnds[i];
                let sum = 0;
                let peak = 0;
                for (let bin = start; bin <= end; bin++) {
                    const value = freqData[bin];
                    sum += value;
                    peak = Math.max(peak, value);
                }
                const avg = sum / (255 * Math.max(1, end - start + 1));
                return shapeBandLevel(avg, peak / 255, i / Math.max(1, CONFIG.spectrumSize - 1));
            }

            function updateSpectrum(dt, now) {
                if (analyser && freqData) {
                    audioPollClock += dt;
                    if (audioPollClock >= CONFIG.audioPollMs) {
                        audioPollClock %= CONFIG.audioPollMs;
                        analyser.getByteFrequencyData(freqData);
                        updateSmoothedSpectrum(readBandLevel);
                    }
                } else {
                    updateSmoothedSpectrum((i) => idleBand(now, i / CONFIG.spectrumSize));
                }
            }

            function updateSmoothedSpectrum(readBand) {
                let peak = 0;
                let peakIndex = 0;
                for (let i = 0; i < CONFIG.spectrumSize; i++) {
                    const raw = readBand(i);
                    const prev = smoothed[i];
                    const smooth = i < 24 ? 0.8 : i > 90 ? 0.6 : 0.7;
                    smoothed[i] = prev * smooth + raw * (1 - smooth);
                    bandFlux[i] = mix(bandFlux[i], Math.abs(raw - prev), CONFIG.fluxBlend);
                    if (smoothed[i] > peak) {
                        peak = smoothed[i];
                        peakIndex = i;
                    }
                }
                dominantHz = bandHz(peakIndex);
                updateBandStaleness();
                updateBandNoiseFloor();
                updateBandSensitivity();
                updateActiveSpectrumRange(smoothed);
            }

            function updateBandSensitivity() {
                const lowEnd = Math.floor((CONFIG.spectrumSize - 1) * CONFIG.lowBandEnd);
                const highStart = Math.floor((CONFIG.spectrumSize - 1) * CONFIG.highBandStart);
                const midStart = Math.min(lowEnd + 1, highStart - 1);
                const midEnd = Math.max(midStart, highStart - 1);
                const lowAnchor = anchorIndexInRange(0, lowEnd);
                const midAnchor = anchorIndexInRange(midStart, midEnd);
                const highAnchor = anchorIndexInRange(highStart, CONFIG.spectrumSize - 1);
                const lowMean = meanInRange(0, lowEnd);
                const midMean = meanInRange(midStart, midEnd);
                const highMean = meanInRange(highStart, CONFIG.spectrumSize - 1);
                lowBandFloor = easeFloor(lowBandFloor, lowMean * 0.38);
                midBandFloor = easeFloor(midBandFloor, midMean * 0.18);
                highBandFloor = easeFloor(highBandFloor, highMean * 0.08);
                lowBandCeiling = easeCeiling(lowBandCeiling, anchorPeak(lowAnchor));
                midBandCeiling = easeCeiling(midBandCeiling, anchorPeak(midAnchor));
                highBandCeiling = easeCeiling(highBandCeiling, anchorPeak(highAnchor));
            }

            function meanInRange(start, end) {
                let sum = 0;
                for (let i = start; i <= end; i++) sum += smoothed[i];
                return sum / Math.max(1, end - start + 1);
            }

            function anchorIndexInRange(start, end) {
                let best = start;
                let bestScore = -1;
                for (let i = start; i <= end; i++) {
                    const score = bandFlux[i] * (0.3 + smoothed[i]);
                    if (score > bestScore) {
                        best = i;
                        bestScore = score;
                    }
                }
                return best;
            }

            function anchorPeak(index) {
                let peak = CONFIG.sensitivityFloor;
                const start = Math.max(0, index - CONFIG.anchorRadius);
                const end = Math.min(CONFIG.spectrumSize - 1, index + CONFIG.anchorRadius);
                for (let i = start; i <= end; i++) peak = Math.max(peak, smoothed[i]);
                return peak;
            }

            function easeFloor(current, target) {
                const bounded = Math.max(CONFIG.sensitivityFloor, target);
                const rate = bounded > current
                    ? CONFIG.sensitivityFloorAttack
                    : CONFIG.sensitivityFloorRelease;
                return mix(current, bounded, rate);
            }

            function easeCeiling(current, target) {
                const bounded = Math.max(CONFIG.sensitivityFloor, target);
                const rate = bounded > current
                    ? CONFIG.sensitivityCeilingAttack
                    : CONFIG.sensitivityCeilingRelease;
                return mix(current, bounded, rate);
            }

            function idleBand(now, t) {
                const seconds = now * 0.001;
                const laneA = wrappedPeak(t, (0.18 + seconds * 0.024) % 1, 0.12) * (0.5 + 0.5 * Math.sin(seconds * 1.7));
                const laneB = wrappedPeak(t, (0.52 - seconds * 0.017 + 1) % 1, 0.1) * (0.5 + 0.5 * Math.sin(seconds * 2.1 + 1.2));
                const laneC = wrappedPeak(t, (0.82 + seconds * 0.012) % 1, 0.14) * (0.5 + 0.5 * Math.cos(seconds * 1.3 + 0.7));
                const shimmer = 0.5 + 0.5 * Math.sin(seconds * 8.4 + t * 48);
                const undertow = 0.5 + 0.5 * Math.cos(seconds * 2.6 - t * 22);
                return clamp(laneA * 0.34 + laneB * 0.28 + laneC * 0.26 + shimmer * 0.08 + undertow * 0.1, 0, 1);
            }

            function updateStats() {
                const nextEnergy = average(8, 60);
                const nextBass = average(2, 20);
                const prev = energy;
                energy = energy * 0.84 + nextEnergy * 0.16;
                bass = bass * 0.82 + nextBass * 0.18;
                punch = punch * 0.76 + Math.max(0, energy - prev) * 3.2;
                updateBackgroundAccent(smoothed);
                energyEl.textContent = energy.toFixed(2);
                punchEl.textContent = punch.toFixed(2);
                peakEl.textContent = `${Math.round(dominantHz)} Hz`;
            }

            function average(lo, hi) {
                let sum = 0;
                let count = 0;
                for (let i = lo; i <= hi; i++) {
                    sum += smoothed[clamp(i, 0, CONFIG.spectrumSize - 1)];
                    count++;
                }
                return count ? sum / count : 0;
            }

            function updateRows(dt, now) {
                sampleClock += dt;
                while (sampleClock >= CONFIG.sampleMs) {
                    sampleClock -= CONFIG.sampleMs;
                    writeSnapshot(now);
                }
                for (let i = 0; i < rowCount; i++) rowAges[rowIndexFromNewest(i)] += dt;
                while (rowCount) {
                    const oldestIndex = rowIndexFromNewest(rowCount - 1);
                    if (rowAges[oldestIndex] <= CONFIG.travelMs) break;
                    rowCount--;
                }
            }

            function rowIndexFromNewest(offset) {
                return (rowHead - offset + MAX_ROWS) % MAX_ROWS;
            }

            function writeSnapshot(now) {
                rowHead = (rowHead + 1) % MAX_ROWS;
                const values = rowValues[rowHead];
                const nextRow = analyser ? projectSpectrumRow(smoothed) : null;
                for (let i = 0; i < CONFIG.laneCount; i++) values[i] = nextRow ? nextRow[i] : sampleLane(now, i);
                maybeCaptureDevRow(values, now);
                rowAges[rowHead] = 0;
                rowCount = Math.min(MAX_ROWS, rowCount + 1);
            }

            function sampleLane(now, lane) {
                if (!analyser) return idleBand(now, laneUs[lane]);
                const sourcePosition = mix(activeSpectrumStart, activeSpectrumEnd, laneUs[lane]);
                return applyBandSensitivity(sampleSpectrumValue(smoothed, sourcePosition), Math.round(sourcePosition));
            }

            function clearFrame(now) {
                ctx.globalAlpha = 1;
                ctx.fillStyle = backgroundGradient;
                ctx.fillRect(0, 0, width, height);
                drawStars(now);
            }

            function drawStars(now) {
                for (let i = 0; i < stars.length; i++) drawStar(stars[i], i, now);
            }

            function drawStar(star, i, now) {
                const drift = (now * 0.006 * star.s) % (width + 80);
                const x = (star.x + drift) % (width + 80) - 40;
                const twinkle = 0.7 + 0.3 * Math.sin(now * 0.001 + i);
                drawDot(x, star.y, CONFIG.dotRadius, STAR_FILL, star.a * twinkle);
            }

            function drawDot(x, y, radius, fillStyle, alpha) {
                if (y <= radius * 2 || alpha <= 0) return;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = fillStyle;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }

            function drawRows() {
                for (let i = rowCount - 1; i >= 0; i--) drawRow(rowIndexFromNewest(i));
            }

            function currentViewMode() {
                return VIEW_MODES[viewModeIndex];
            }

            function normalizeModeId(value) {
                return (value || '').trim().toLowerCase();
            }

            function viewModeIndexById(modeId) {
                const normalized = normalizeModeId(modeId);
                if (normalized === 'fractal') return 1;
                for (let i = 0; i < VIEW_MODES.length; i++) {
                    if (VIEW_MODES[i].id === normalized) return i;
                }
                return -1;
            }

            function parseViewModeHash(hash = window.location.hash) {
                const raw = normalizeModeId(hash.replace(/^#/, ''));
                if (!raw) return '';
                if (!raw.includes('=')) return raw;
                const params = new URLSearchParams(raw);
                return normalizeModeId(params.get('mode') || params.get('view') || '');
            }

            function readViewModeFromHash(hash = window.location.hash) {
                return viewModeIndexById(parseViewModeHash(hash));
            }

            function syncHashToViewMode(modeId) {
                const nextHash = `#mode=${modeId}`;
                if (window.location.hash === nextHash) return;
                window.location.hash = nextHash;
            }

            function applyViewModeFromHash() {
                const nextIndex = readViewModeFromHash();
                if (nextIndex === -1) return;
                setViewMode(nextIndex, { syncHash: false, reveal: false });
                syncHashToViewMode(currentViewMode().id);
            }

            function handleHashChange() {
                applyViewModeFromHash();
            }

            function updateModeLabel() {
                modeEl.textContent = currentViewMode().label;
            }

            function updateHeroMessage() {
                const isLive = Boolean(analyser);
                const mode = currentViewMode().id;
                const live = {
                    road: 'Road mode. Live horizon snapshots stream down the dotted rainbow road. Use the View button or press Space to switch views.',
                    sphere: 'Sphere mode. Live spectrum rows wrap into a dotted glowing orb that breathes through depth. Use the View button or press Space to switch views.',
                };
                const idle = {
                    road: 'Road mode. Synthetic horizon snapshots keep flowing toward you until the mic starts. Use the View button or press Space to switch views.',
                    sphere: 'Sphere mode. Synthetic dotted orbs keep breathing from the center until the mic starts. Use the View button or press Space to switch views.',
                };
                setMessage((isLive ? live : idle)[mode] || live.road);
            }

            function setViewMode(nextIndex, { syncHash = true, reveal = true } = {}) {
                viewModeIndex = ((nextIndex % VIEW_MODES.length) + VIEW_MODES.length) % VIEW_MODES.length;
                updateModeLabel();
                updateButtons();
                updateHeroMessage();
                if (reveal) revealOverlayTemporarily();
                if (syncHash) syncHashToViewMode(currentViewMode().id);
            }

            function cycleViewMode() {
                setViewMode(viewModeIndex + 1);
            }

            function rowState(rowIndex) {
                const age = rowAges[rowIndex];
                const depth = age / CONFIG.travelMs;
                if (depth <= 0 || depth >= 1) return null;
                return {
                    age,
                    depth,
                    fade: 1 - smoothstep(0, 1, depth),
                    travel: rowTravelT(depth),
                    values: rowValues[rowIndex],
                };
            }

            function measureBand(values, start, end) {
                let total = 0;
                const lo = Math.max(0, start);
                const hi = Math.min(CONFIG.laneCount - 1, end);
                for (let i = lo; i <= hi; i++) total += values[i];
                return total / Math.max(1, hi - lo + 1);
            }

            function sampleFractalBand(values, t) {
                const center = Math.floor(clamp(t, 0, 0.9999) * (CONFIG.laneCount - 1));
                const start = Math.max(0, center - 1);
                const end = Math.min(CONFIG.laneCount - 1, center + 1);
                return measureBand(values, start, end);
            }

            function drawFractalScene(now) {
                for (let offset = rowCount - 1; offset >= 0; offset--) drawFractalRow(rowIndexFromNewest(offset));
            }

            function drawFractalRow(rowIndex) {
                const state = rowState(rowIndex);
                if (!state) return;
                const maxRadius = Math.hypot(width, height) * 0.5 * FRACTAL.shellMaxRadiusFactor;
                const baseRadius = Math.max(FRACTAL.shellMinRadius, maxRadius * state.travel);
                for (let i = 0; i < FRACTAL.sampleCount; i++) drawFractalDot(state.values, state.age, i, baseRadius, state.fade, state.depth);
            }

            function drawTunnelScene() {
                for (let offset = rowCount - 1; offset >= 0; offset--) drawTunnelRow(rowIndexFromNewest(offset));
            }

            function drawTunnelRow(rowIndex) {
                const state = rowState(rowIndex);
                if (!state) return;
                const radiusX = mix(width * 0.05, width * 0.55, state.travel);
                const radiusY = mix(height * 0.03, height * 0.23, state.travel);
                for (let i = 0; i < FRACTAL.sampleCount; i++) drawTunnelDot(state, i, radiusX, radiusY);
            }

            function drawTunnelDot(state, sampleIndex, radiusX, radiusY) {
                const t = sampleIndex / FRACTAL.sampleCount;
                const amp = sampleFractalBand(state.values, t);
                const lane = Math.min(CONFIG.laneCount - 1, Math.floor(t * CONFIG.laneCount));
                const x = centerX + fractalCos[sampleIndex] * (radiusX + amp * 38);
                const y = horizonY + fractalSin[sampleIndex] * (radiusY + amp * 18) - amp * 42 * (1 - state.depth);
                drawModeDot(x, y, amp, state.fade, lane, state.age, sampleIndex);
            }

            function drawSphereScene() {
                const latest = rowHeadState();
                if (latest) drawSphereScaffold(latest);
                for (let offset = rowCount - 1; offset >= 0; offset--) drawSphereRow(rowIndexFromNewest(offset));
            }

            function drawSphereScaffold(state) {
                const energy = measureBand(state.values, 0, CONFIG.laneCount - 1);
                const radius = mix(width * 0.14, Math.hypot(width, height) * 0.3, shapePulseScale(energy, 0));
                for (let i = 0; i < FRACTAL.sampleCount; i += 3) drawSphereScaffoldDot(i, radius, state.fade, state.age);
            }

            function drawSphereScaffoldDot(sampleIndex, radius, fade, age) {
                const front = 0.5 + 0.5 * fractalSin[sampleIndex];
                const x = centerX + fractalCos[sampleIndex] * radius * (0.76 + front * 0.4);
                const y = centerY + fractalSin[sampleIndex] * radius * 0.82;
                drawScaffoldDot(x, y, fade * (0.4 + front * 0.4), age, sampleIndex, 1.25 + front * 0.4);
            }

            function drawSphereRow(rowIndex) {
                const state = rowState(rowIndex);
                if (!state) return;
                const energy = measureBand(state.values, 0, CONFIG.laneCount - 1);
                const radius = mix(width * 0.13, Math.hypot(width, height) * 0.42, state.travel) * shapePulseScale(energy, state.depth);
                for (let i = 0; i < FRACTAL.sampleCount; i++) drawSphereDot(state, i, radius);
            }

            function drawSphereDot(state, sampleIndex, radius) {
                const t = sampleIndex / FRACTAL.sampleCount;
                const amp = sampleFractalBand(state.values, t);
                const lane = Math.min(CONFIG.laneCount - 1, Math.floor(t * CONFIG.laneCount));
                const front = 0.5 + 0.5 * fractalSin[sampleIndex];
                const shell = radius * (0.76 + front * 0.44);
                const x = centerX + fractalCos[sampleIndex] * shell;
                const y = centerY + fractalSin[sampleIndex] * radius * 0.72 - amp * 42 * front;
                drawShapeDot(x, y, amp, state.fade * (0.42 + front * 0.58), lane, state.age, sampleIndex, 1.6 + front * 0.9);
            }

            function drawCubeScene() {
                const latest = rowHeadState();
                if (latest) drawCubeScaffold(latest);
                for (let offset = rowCount - 1; offset >= 0; offset--) drawCubeRow(rowIndexFromNewest(offset));
            }

            function cubeFrame(viewWidth, viewHeight, travel) {
                const frontHalfWidth = mix(viewWidth * 0.12, viewWidth * 0.26, travel);
                const frontHalfHeight = frontHalfWidth * 0.58;
                const backHalfWidth = frontHalfWidth * 0.58;
                const backHalfHeight = frontHalfHeight * 0.58;
                return {
                    frontHalfWidth,
                    frontHalfHeight,
                    backHalfWidth,
                    backHalfHeight,
                    backOffsetX: frontHalfWidth * 0.34,
                    backOffsetY: -frontHalfHeight * 0.34,
                };
            }

            function shapePulseScale(amp, depth) {
                return 1 + amp * 0.18 + (1 - depth) * 0.08;
            }

            function rowHeadState() {
                return rowCount ? rowState(rowHead) : null;
            }

            function cubeVertices(frame) {
                const cx = centerX;
                const cy = centerY;
                const fx = frame.frontHalfWidth;
                const fy = frame.frontHalfHeight;
                const bx = frame.backHalfWidth;
                const by = frame.backHalfHeight;
                const ox = frame.backOffsetX;
                const oy = frame.backOffsetY;
                return [
                    [cx - fx, cy - fy], [cx + fx, cy - fy], [cx + fx, cy + fy], [cx - fx, cy + fy],
                    [cx - bx + ox, cy - by + oy], [cx + bx + ox, cy - by + oy], [cx + bx + ox, cy + by + oy], [cx - bx + ox, cy + by + oy],
                ];
            }

            function cubePoint(a, b, t) {
                return [mix(a[0], b[0], t), mix(a[1], b[1], t)];
            }

            function drawCubeRow(rowIndex) {
                const state = rowState(rowIndex);
                if (!state) return;
                const energy = measureBand(state.values, 0, CONFIG.laneCount - 1);
                const frame = cubeFrame(width, height, mix(0.12, 0.58, state.travel) * shapePulseScale(energy, state.depth));
                drawCubeEdges(frame, state, state.fade, true);
            }

            function drawCubeScene() {
                const latest = rowHeadState();
                if (latest) drawCubeScaffold(latest);
                for (let offset = rowCount - 1; offset >= 0; offset--) drawCubeRow(rowIndexFromNewest(offset));
            }

            function drawCubeScaffold(state) {
                const frame = cubeFrame(width, height, 0.26 * shapePulseScale(measureBand(state.values, 0, CONFIG.laneCount - 1), 0));
                drawCubeEdges(frame, state, 0.88, false);
            }

            function drawCubeEdges(frame, state, fade, colored) {
                const vertices = cubeVertices(frame);
                const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
                for (let i = 0; i < edges.length; i++) drawCubeEdge(vertices, edges[i], state, fade, colored, i);
            }

            function drawCubeEdge(vertices, edge, state, fade, colored, edgeIndex) {
                const [from, to] = edge;
                for (let lane = 0; lane < CONFIG.laneCount; lane += 6) {
                    const t = laneUs[lane];
                    const [x, y] = cubePoint(vertices[from], vertices[to], t);
                    const amp = state.values[lane];
                    const lift = colored ? amp * 28 * (1 - state.depth * 0.5) : 0;
                    drawCubeEdgeDot(x, y - lift, amp, fade, lane, state.age, edgeIndex * 200 + lane, colored);
                }
            }

            function drawCubeEdgeDot(x, y, amp, fade, lane, age, seed, colored) {
                drawScaffoldDot(x, y, fade, age, seed, 1.15);
                if (!colored) return;
                drawShapeDot(x, y, amp, fade * 0.94, lane, age, seed, 1.1);
            }

            function drawModeDot(x, y, amp, fade, lane, age, seed) {
                const sparkle = 0.82 + 0.18 * Math.sin(age * 0.004 + seed * 0.91 + amp * 11.7);
                const glow = (0.02 + amp * 0.16) * fade * sparkle;
                const color = laneFillStyles[lane];
                if (glow > 0.006) drawDot(x, y, CONFIG.dotRadius * 3.8, color, glow);
                drawDot(x, y, CONFIG.dotRadius, color, (0.08 + amp * 0.9) * fade);
            }

            function drawShapeDot(x, y, amp, fade, lane, age, seed, size) {
                const pulse = 0.78 + 0.22 * Math.sin(age * 0.006 + seed * 0.37 + amp * 9.5);
                const color = laneFillStyles[lane];
                const neutral = 'rgba(190,198,214,0.92)';
                const glow = (0.04 + amp * 0.18) * fade * pulse;
                if (glow > 0.008) drawDot(x, y, CONFIG.dotRadius * (3.4 + size), color, glow);
                drawDot(x, y, CONFIG.dotRadius * (1.3 + size * 0.35), neutral, (0.12 + amp * 0.18) * fade);
                drawDot(x, y, CONFIG.dotRadius * size, color, (0.05 + amp * 0.72) * fade * pulse);
            }

            function drawScaffoldDot(x, y, fade, age, seed, size) {
                const pulse = 0.86 + 0.14 * Math.sin(age * 0.004 + seed * 0.21);
                drawDot(x, y, CONFIG.dotRadius * (1.2 + size * 0.3), 'rgba(206,212,222,0.22)', fade * 0.26 * pulse);
                drawDot(x, y, CONFIG.dotRadius * size, 'rgba(182,188,198,0.88)', fade * 0.62 * pulse);
            }

            function drawActiveMode(now) {
                const mode = currentViewMode().id;
                if (mode === 'road') return drawRows();
                if (mode === 'sphere') return drawSphereScene();
            }

            function drawActiveHorizon() {
                const mode = currentViewMode().id;
                if (mode === 'road') drawHorizon();
            }

            function drawFractalDot(values, age, sampleIndex, baseRadius, fade, depth) {
                const t = sampleIndex / FRACTAL.sampleCount;
                const amp = sampleFractalBand(values, t);
                const laneIndex = Math.min(CONFIG.laneCount - 1, Math.floor(t * CONFIG.laneCount));
                const lift = amp * FRACTAL.radialLift * (1 - depth * 0.35);
                const radius = baseRadius + lift;
                const x = centerX + fractalCos[sampleIndex] * radius;
                const y = centerY + fractalSin[sampleIndex] * radius;
                const sparkle = 0.82 + 0.18 * Math.sin(age * 0.004 + sampleIndex * 0.91 + amp * 11.7);
                const glow = (0.02 + amp * 0.16) * fade * sparkle;
                const color = laneFillStyles[laneIndex];
                if (glow > 0.006) drawDot(x, y, CONFIG.dotRadius * FRACTAL.glowScale, color, glow);
                drawDot(x, y, CONFIG.dotRadius * FRACTAL.coreScale, color, (0.08 + amp * 0.9) * fade);
                if (depth < 0.06 && sampleIndex % 12 === 0) drawDot(centerX, centerY, CONFIG.dotRadius * 1.5, WHITE_FILL, fade * 0.12);
            }

            function drawRow(rowIndex) {
                const depth = rowAges[rowIndex] / CONFIG.travelMs;
                if (depth <= 0 || depth >= 1) return;
                const widthNow = rowWidth(depth);
                const y = rowY(depth);
                const values = rowValues[rowIndex];
                for (let lane = 0; lane < CONFIG.laneCount; lane++) drawRowDot(values, rowAges[rowIndex], lane, widthNow, y, depth);
            }

            function drawRowDot(values, age, lane, widthNow, y, depth) {
                const x = centerX + laneCenters[lane] * widthNow * 0.5;
                const amp = values[lane];
                const lift = amp * CONFIG.horizonLift * (1 - depth);
                const fade = 1 - smoothstep(0, 1, depth);
                const sparkle = 0.82 + 0.18 * Math.sin(age * 0.004 + lane * 0.91 + amp * 11.7);
                const glow = (0.02 + amp * 0.16) * fade * sparkle;
                const color = laneFillStyles[lane];
                if (glow > 0.006) drawDot(x, y - lift, CONFIG.dotRadius * 3.8, color, glow);
                drawDot(x, y - lift, CONFIG.dotRadius, color, (0.08 + amp * 0.9) * fade);
            }

            function rowWidth(depth) {
                return mix(width * CONFIG.horizonWidth, width * CONFIG.nearWidth, Math.pow(depth, 0.92));
            }

            function rowY(depth) {
                const t = Math.pow(depth, 1.75);
                return mix(horizonY, bottomY, t);
            }

            function rowTravelT(depth) {
                return Math.pow(depth, 1.75);
            }

            function drawHorizon() {
                if (!rowCount) return;
                const newest = rowValues[rowHead];
                for (let lane = 0; lane < CONFIG.laneCount; lane++) drawHorizonDot(newest, lane);
                for (let lane = 0; lane < CONFIG.laneCount - 1; lane++) drawHorizonMidDot(newest, lane);
            }

            function drawHorizonDot(values, lane) {
                const x = centerX + laneCenters[lane] * horizonHalfWidth;
                const amp = values[lane];
                const jitter = (Math.sin(lane * 12.73 + amp * 19.1) * 0.5 + 0.5) * 10;
                const y = horizonY - amp * CONFIG.horizonLift - jitter * smoothstep(0.02, 0.3, amp);
                const topFade = smoothstep(topFadeMinY, topFadeMaxY, y);
                const color = laneFillStyles[lane];
                if (amp > 0.001 && topFade > 0.02) {
                    drawDot(x, y, CONFIG.dotRadius * 5, color, (0.08 + amp * 0.12) * topFade);
                    drawDot(x, y, CONFIG.dotRadius * 1.9, WHITE_FILL, (0.08 + amp * 0.14) * topFade);
                }
                if (topFade > 0.02) drawDot(x, y, CONFIG.dotRadius, color, (0.32 + amp * 0.78) * topFade);
            }

            function drawHorizonMidDot(values, lane) {
                const amp = (values[lane] + values[lane + 1]) * 0.5;
                const x = centerX + midLaneCenters[lane] * horizonHalfWidth;
                const jitter = (Math.sin((lane + 0.5) * 10.91 + amp * 17.3) * 0.5 + 0.5) * 8;
                const y = horizonY - amp * CONFIG.horizonLift - jitter * smoothstep(0.02, 0.3, amp);
                const topFade = smoothstep(topFadeMinY, topFadeMaxY, y);
                const color = midLaneFillStyles[lane];
                if (amp <= 0.001 || topFade <= 0.02) return;
                drawDot(x, y, CONFIG.dotRadius * 0.9, color, (0.24 + amp * 0.52) * topFade);
            }

            function drawScanlines() {
                if (!scanlineCanvas) return;
                ctx.globalAlpha = 1;
                ctx.drawImage(scanlineCanvas, 0, 0);
            }

            function drawVignette() {
                ctx.globalAlpha = 1;
                ctx.fillStyle = vignetteGradient;
                ctx.fillRect(0, 0, width, height);
            }

            function setMessage(text) {
                msg.textContent = text;
            }

            function setOverlayVisible(visible) {
                ui.classList.toggle('hidden', !visible);
            }

            function scheduleOverlayHide(delay = 10000) {
                clearTimeout(overlayHideTimer);
                if (!analyser) return;
                overlayHideTimer = window.setTimeout(() => setOverlayVisible(false), delay);
            }

            function revealOverlayTemporarily() {
                setOverlayVisible(true);
                if (analyser) scheduleOverlayHide(3700);
            }

            function shouldIgnoreSpaceToggle(event) {
                const target = event.target;
                if (!target || !(target instanceof HTMLElement)) return false;
                if (target.closest('button')) return true;
                if (target.isContentEditable) return true;
                return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
            }

            function handleKeydown(event) {
                if (event.code !== 'Space' || event.repeat || shouldIgnoreSpaceToggle(event)) return;
                event.preventDefault();
                cycleViewMode();
            }

            function updateButtons() {
                toggleAudioBtn.textContent = analyser ? 'Stop' : 'Start mic';
                toggleViewBtn.textContent = `View: ${currentViewMode().label}`;
                fullscreenBtn.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
            }

            async function startAudio() {
                if (analyser) return;
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const source = audioContext.createMediaStreamSource(stream);
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = CONFIG.fftSize;
                    analyser.smoothingTimeConstant = 0.72;
                    source.connect(analyser);
                    freqData = new Uint8Array(analyser.frequencyBinCount);
                    buildBandMap();
                    audioPollClock = CONFIG.audioPollMs;
                    statsClock = CONFIG.statsMs;
                    updateButtons();
                    updateHeroMessage();
                    setOverlayVisible(true);
                    scheduleOverlayHide();
                } catch (error) {
                    console.error(error);
                    stopAudio();
                    setMessage('Microphone access failed. The selected view stays in idle mode with synthetic spectrum motion.');
                }
            }

            function stopAudio() {
                clearTimeout(overlayHideTimer);
                if (stream) stream.getTracks().forEach((track) => track.stop());
                if (audioContext) audioContext.close().catch(() => { });
                audioContext = null;
                analyser = null;
                stream = null;
                freqData = null;
                bandStarts = new Uint16Array(0);
                bandEnds = new Uint16Array(0);
                bandFlux.fill(0);
                lowBandFloor = 0.06;
                lowBandCeiling = 0.24;
                midBandFloor = 0.045;
                midBandCeiling = 0.18;
                highBandFloor = 0.035;
                highBandCeiling = 0.14;
                activeSpectrumStart = 0;
                activeSpectrumEnd = CONFIG.spectrumSize - 1;
                bandStaleness.fill(0);
                bandNoiseFloor.fill(0);
                devCapturedRowCount = 0;
                lastDevCaptureLogAt = -Infinity;
                window.__vizCapturedRows = [];
                audioPollClock = 0;
                updateButtons();
                updateHeroMessage();
                setOverlayVisible(true);
            }

            function handleVisibilityChange() {
                isPageVisible = !document.hidden;
                lastFrame = 0;
                syncKeepAwakeMedia();
                if (isPageVisible) {
                    setOverlayVisible(true);
                    if (analyser) scheduleOverlayHide(2500);
                }
            }

            function handlePointerDown() {
                revealOverlayTemporarily();
                syncKeepAwakeMedia();
            }

            async function toggleAudio() {
                if (analyser) stopAudio();
                else await startAudio();
            }

            async function toggleFullscreen() {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
                syncKeepAwakeMedia();
                updateButtons();
            }

            function frame(now) {
                requestAnimationFrame(frame);
                if (!lastFrame) lastFrame = now;
                const dt = Math.min(40, now - lastFrame);
                lastFrame = now;
                if (!isPageVisible) return;
                updateSpectrum(dt, now);
                statsClock += dt;
                if (statsClock >= CONFIG.statsMs) {
                    statsClock %= CONFIG.statsMs;
                    updateStats();
                }
                updateRows(dt, now);
                clearFrame(now);
                drawActiveMode(now);
                drawActiveHorizon();
                drawScanlines();
                drawVignette();
                ctx.globalAlpha = 1;
            }

            toggleAudioBtn.addEventListener('click', () => toggleAudio().catch(console.error));
            toggleViewBtn.addEventListener('click', cycleViewMode);
            fullscreenBtn.addEventListener('click', () => toggleFullscreen().catch(console.error));
            window.addEventListener('mousemove', revealOverlayTemporarily);
            window.addEventListener('pointerdown', handlePointerDown);
            window.addEventListener('keydown', handleKeydown);
            window.addEventListener('hashchange', handleHashChange);
            document.addEventListener('fullscreenchange', () => {
                syncKeepAwakeMedia();
                updateButtons();
            });
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('resize', scheduleResize);

            applyResize();
            applyViewModeFromHash();
            updateButtons();
            updateModeLabel();
            setOverlayVisible(true);
            syncKeepAwakeMedia();
            writeSnapshot(0);
            updateHeroMessage();
            updateStats();
            requestAnimationFrame(frame);
        
}
