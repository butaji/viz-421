import { describe, expect, test } from 'vitest'
import {
  buildOutputContainsProdPaths,
  buildOutputInlinesRuntimeWithoutImports,
  loadVisualizerEnvironment,
} from './helpers/extract-visualizer.mjs'
import { capturedRows } from './fixtures/captured-rows.mjs'
import { capturedQuietRows } from './fixtures/captured-rows-quiet.mjs'
import { capturedTailFlatRows } from './fixtures/captured-rows-tail-flat.mjs'
import { capturedLatestRows } from './fixtures/captured-rows-latest.mjs'
import { capturedRoomNoiseRows } from './fixtures/captured-room-noise.mjs'

describe('visualizer core behavior', () => {
  function mean(values, start, end) {
    let sum = 0
    for (let i = start; i <= end; i++) sum += values[i]
    return sum / Math.max(1, end - start + 1)
  }

  function diffFlux(next, prev) {
    return Float32Array.from(next.map((value, index) => Math.abs(value - prev[index])))
  }

  test('math helpers clamp and ease values predictably', async () => {
    const env = await loadVisualizerEnvironment(['clamp', 'mix', 'smoothstep', 'wrappedPeak'])
    expect(env.clamp(2, 0, 1)).toBe(1)
    expect(env.mix(10, 20, 0.25)).toBe(12.5)
    expect(env.smoothstep(0, 10, 5)).toBeCloseTo(0.5, 3)
    expect(env.wrappedPeak(0.99, 0.01, 0.05)).toBeGreaterThan(0)
  })

  test('dev capture stays gated to local debug sessions and formats rows for console output', async () => {
    const env = await loadVisualizerEnvironment(
      ['devCaptureMode', 'shouldCaptureDevRows', 'formatCapturedRow'],
      ['CONFIG'],
      {
        window: {
          location: {
            hostname: '127.0.0.1',
            search: '?captureRows=1',
            hash: '#mode=road',
          },
        },
      },
    )
    expect(env.shouldCaptureDevRows()).toBe(true)
    expect(env.devCaptureMode()).toBe('sample')
    const row = env.formatCapturedRow(Float32Array.from([0.123456, 0.5, 0.987654, 0.25]), 'test')
    expect(row.label).toBe('test')
    expect(row.values).toHaveLength(4)
    expect(row.sample32.length).toBeGreaterThan(0)
  })

  test('dev capture stream mode stays enabled on localhost', async () => {
    const env = await loadVisualizerEnvironment(
      ['devCaptureMode', 'shouldCaptureDevRows', 'shouldLogDevCaptureStream'],
      ['CONFIG'],
      {
        window: {
          location: {
            hostname: '127.0.0.1',
            search: '?captureRows=stream',
            hash: '',
          },
        },
        lastDevCaptureLogAt: -Infinity,
      },
    )
    expect(env.shouldCaptureDevRows()).toBe(true)
    expect(env.devCaptureMode()).toBe('stream')
    expect(env.shouldLogDevCaptureStream(0)).toBe(true)
    expect(env.shouldLogDevCaptureStream(3000)).toBe(false)
  })

  test('iPadOS detection treats touch Macs as Apple tablets', async () => {
    const env = await loadVisualizerEnvironment(['isAppleTabletDevice'], [], {
      navigator: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
    })
    expect(env.isAppleTabletDevice()).toBe(true)
  })

  test('keep-awake media only runs for fullscreen Apple tablets while visible', async () => {
    const env = await loadVisualizerEnvironment(['isAppleTabletDevice', 'isFullscreenMode', 'shouldRunKeepAwakeMedia'], [], {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5,
      },
      document: {
        fullscreenElement: {},
        hidden: false,
      },
      window: {
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      },
    })
    expect(env.isFullscreenMode()).toBe(true)
    expect(env.shouldRunKeepAwakeMedia()).toBe(true)
  })

  test('keep-awake media stays off outside fullscreen mode', async () => {
    const env = await loadVisualizerEnvironment(['isAppleTabletDevice', 'isFullscreenMode', 'shouldRunKeepAwakeMedia'], [], {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5,
      },
      document: {
        fullscreenElement: null,
        hidden: false,
      },
      window: {
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      },
    })
    expect(env.isFullscreenMode()).toBe(false)
    expect(env.shouldRunKeepAwakeMedia()).toBe(false)
  })

  test('palette interpolation and rgb output stay valid', async () => {
    const env = await loadVisualizerEnvironment(['clamp', 'mix', 'palette', 'rgb'], ['PALETTE'])
    const color = env.palette(0.5)
    expect(color).toHaveLength(3)
    color.forEach((value) => expect(value).toBeGreaterThanOrEqual(0))
    expect(env.rgb([1, 0.5, 0])).toBe('rgb(255, 128, 0)')
  })

  test('dominant spectrum colors tint the background darkly and subtly', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'palette', 'mixColor', 'dominantSpectrumColor', 'tintBackgroundColor'],
      ['CONFIG', 'PALETTE'],
    )
    const spectrum = Float32Array.from({ length: env.CONFIG.spectrumSize }, (_, i) => (i > 90 ? 0.8 : i > 20 && i < 40 ? 0.3 : 0.02))
    const dominant = env.dominantSpectrumColor(spectrum)
    const tinted = env.tintBackgroundColor(dominant, 0.18)
    expect(dominant[0]).toBeGreaterThan(dominant[1])
    expect(tinted[0]).toBeLessThan(0.2)
    expect(tinted[1]).toBeLessThan(0.2)
    expect(tinted[2]).toBeLessThan(0.2)
  })

  test('cube geometry keeps a visible front face and inset back face', async () => {
    const env = await loadVisualizerEnvironment(['mix', 'cubeFrame', 'shapePulseScale'], ['CONFIG'])
    const frame = env.cubeFrame(1200, 700, 0.55)
    expect(frame.frontHalfWidth).toBeGreaterThan(frame.backHalfWidth)
    expect(frame.frontHalfHeight).toBeGreaterThan(frame.backHalfHeight)
    expect(frame.backOffsetX).toBeGreaterThan(0)
    expect(frame.backOffsetY).toBeLessThan(0)
    expect(env.shapePulseScale(0.8, 0.3)).toBeGreaterThan(env.shapePulseScale(0.2, 0.3))
  })

  test('drawDot skips dots that are fully outside the viewport', async () => {
    const calls = []
    const env = await loadVisualizerEnvironment(['drawDot'], [], {
      width: 1200,
      height: 700,
      ctx: {
        beginPath: () => calls.push('beginPath'),
        arc: () => calls.push('arc'),
        fill: () => calls.push('fill'),
        fillStyle: '',
        globalAlpha: 1,
      },
    })
    env.drawDot(1305, 480, 8, 'rgb(255, 0, 0)', 0.8)
    env.drawDot(-20, 480, 8, 'rgb(255, 0, 0)', 0.8)
    env.drawDot(320, 715, 8, 'rgb(255, 0, 0)', 0.8)
    expect(calls).toHaveLength(0)
  })

  test('band smoothing table preserves the existing low-mid-high buckets', async () => {
    const env = await loadVisualizerEnvironment(['buildBandSmoothingTable'], ['CONFIG'])
    const table = env.buildBandSmoothingTable(env.CONFIG.spectrumSize)
    expect(table[0]).toBeCloseTo(0.8, 5)
    expect(table[23]).toBeCloseTo(0.8, 5)
    expect(table[24]).toBeCloseTo(0.7, 5)
    expect(table[90]).toBeCloseTo(0.7, 5)
    expect(table[91]).toBeCloseTo(0.6, 5)
  })

  test('band mapping stays monotonic and within analyser bounds', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'bandHz', 'bandIndex', 'bandBounds'],
      ['CONFIG'],
      { freqData: new Uint8Array(2048) },
    )
    const first = env.bandHz(0)
    const last = env.bandHz(env.CONFIG.spectrumSize - 1)
    expect(first).toBeLessThan(last)
    const [start, end] = env.bandBounds(40, 24000)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThanOrEqual(start)
    expect(end).toBeLessThan(env.freqData.length)
  })

  test('sensitivity scaling favors the right side more strongly', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.18,
        lowBandCeiling: 0.72,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.03,
        highBandCeiling: 0.12,
      },
    )
    const left = env.applyBandSensitivity(0.08, 12)
    const right = env.applyBandSensitivity(0.08, 108)
    expect(right).toBeGreaterThan(left)
  })

  test('left-side scaling preserves variation instead of flattening low-band motion', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.2,
        lowBandCeiling: 0.68,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.12,
      },
    )
    const softerLow = env.applyBandSensitivity(0.08, 10)
    const strongerLow = env.applyBandSensitivity(0.18, 10)
    expect(strongerLow - softerLow).toBeGreaterThan(0.1)
  })

  test('right-side scaling preserves variation for quiet high-band motion', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    const softerHigh = env.applyBandSensitivity(0.014, 108)
    const strongerHigh = env.applyBandSensitivity(0.03, 108)
    expect(strongerHigh - softerHigh).toBeGreaterThan(0.02)
  })

  test('whole spectrum scaling avoids flat dead zones on both edges', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    const lowEdgeSpread = env.applyBandSensitivity(0.08, 10) - env.applyBandSensitivity(0.04, 10)
    const highEdgeSpread = env.applyBandSensitivity(0.03, 108) - env.applyBandSensitivity(0.014, 108)
    expect(lowEdgeSpread).toBeGreaterThan(0.08)
    expect(highEdgeSpread).toBeGreaterThan(0.02)
  })

  test('green-blue body uses more of the vertical range', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    expect(env.applyBandSensitivity(0.24, 25)).toBeGreaterThan(0.4)
  })

  test('red-purple tail lifts tiny values into visible spread', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    const quiet = env.applyBandSensitivity(0.008, 108)
    const active = env.applyBandSensitivity(0.02, 108)
    expect(active - quiet).toBeGreaterThan(0.16)
  })

  test('whole-spectrum scaling lifts the far-right tail into visible occupancy', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    expect(env.applyBandSensitivity(0.03, 108)).toBeGreaterThan(0.3)
    expect(env.applyBandSensitivity(0.008, 108)).toBeGreaterThan(0.05)
  })

  test('whole-spectrum scaling gives the green-blue body deeper occupancy', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.201,
        lowBandCeiling: 0.677,
        midBandFloor: 0.06,
        midBandCeiling: 0.24,
        highBandFloor: 0.035,
        highBandCeiling: 0.121,
      },
    )
    expect(env.applyBandSensitivity(0.24, 25)).toBeGreaterThan(0.45)
    expect(env.applyBandSensitivity(0.18, 60)).toBeGreaterThan(0.55)
  })

  test('changing-band anchors drive slow floor and ceiling updates', async () => {
    const env = await loadVisualizerEnvironment(
      ['mix', 'meanInRange', 'anchorIndexInRange', 'anchorPeak', 'easeFloor', 'easeCeiling', 'updateBandSensitivity'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from({ length: 120 }, (_, i) => (i > 92 && i < 100 ? 0.12 : i < 24 ? 0.45 : 0.02)),
        bandFlux: Float32Array.from({ length: 120 }, (_, i) => (i === 96 || i === 10 ? 0.4 : 0.01)),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.09,
      },
    )
    env.updateBandSensitivity()
    expect(env.lowBandCeiling).toBeGreaterThan(0.24)
    expect(env.highBandCeiling).toBeGreaterThan(0.09)
  })

  test('scaling anchors change slowly over time when spectrum shifts', async () => {
    const env = await loadVisualizerEnvironment(
      ['mix', 'meanInRange', 'anchorIndexInRange', 'anchorPeak', 'easeFloor', 'easeCeiling', 'updateBandSensitivity'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from({ length: 120 }, (_, i) => (i > 95 && i < 101 ? 0.2 : 0.02)),
        bandFlux: Float32Array.from({ length: 120 }, (_, i) => (i === 98 ? 0.4 : 0.01)),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.09,
      },
    )
    const before = env.highBandCeiling
    env.updateBandSensitivity()
    const afterOneStep = env.highBandCeiling
    expect(afterOneStep - before).toBeGreaterThan(0)
    expect(afterOneStep - before).toBeLessThan(0.01)
  })

  test('stale low-variation bands lose sensitivity gradually over time', async () => {
    const env = await loadVisualizerEnvironment(
      ['mix', 'updateBandStaleness', 'stalenessDampingFor'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from({ length: 120 }, () => 0.32),
        bandFlux: Float32Array.from({ length: 120 }, () => 0.0002),
        bandStaleness: Float32Array.from({ length: 120 }, () => 0),
      },
    )
    for (let i = 0; i < 60; i++) env.updateBandStaleness()
    expect(env.bandStaleness[20]).toBeGreaterThan(0.2)
    expect(env.stalenessDampingFor(20)).toBeLessThan(1)
  })

  test('stale-band damping recovers slowly when flux returns', async () => {
    const env = await loadVisualizerEnvironment(
      ['mix', 'updateBandStaleness', 'stalenessDampingFor'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from({ length: 120 }, () => 0.32),
        bandFlux: Float32Array.from({ length: 120 }, () => 0.0002),
        bandStaleness: Float32Array.from({ length: 120 }, () => 0),
      },
    )
    for (let i = 0; i < 60; i++) env.updateBandStaleness()
    const damped = env.stalenessDampingFor(20)
    env.bandFlux[20] = 0.3
    env.updateBandStaleness()
    const recovered = env.stalenessDampingFor(20)
    expect(recovered).toBeGreaterThan(damped)
    expect(recovered - damped).toBeLessThan(0.1)
  })

  test('captured room-noise rows reveal strong steady ventilator occupancy without music', () => {
    const row = capturedRoomNoiseRows[1].values
    expect(mean(row, 20, 60)).toBeGreaterThan(0.6)
    expect(mean(row, 100, 119)).toBeGreaterThan(0.03)
  })

  test('adaptive room-noise floor rises under steady ventilator-like input', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'updateBandNoiseFloor', 'noiseFloorFor'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from(capturedRoomNoiseRows[0].values),
        bandFlux: new Float32Array(120),
        bandNoiseFloor: new Float32Array(120),
      },
    )
    let previous = capturedRoomNoiseRows[0].values
    for (const row of capturedRoomNoiseRows) {
      env.smoothed = Float32Array.from(row.values)
      env.bandFlux = diffFlux(row.values, previous)
      env.updateBandNoiseFloor()
      previous = row.values
    }
    expect(env.noiseFloorFor(24)).toBeGreaterThan(0.1)
    expect(env.noiseFloorFor(110)).toBeGreaterThan(0.01)
  })

  test('projected room-noise rows get suppressed after the noise floor learns the room', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'noiseFloorFor', 'applyBandSensitivity', 'sampleSpectrumValue', 'sampleProjectedSpectrum', 'applyProjectionFloor', 'projectSpectrumRow', 'updateBandNoiseFloor'],
      ['CONFIG'],
      {
        smoothed: Float32Array.from(capturedRoomNoiseRows[0].values),
        bandFlux: new Float32Array(120),
        bandStaleness: new Float32Array(120),
        bandNoiseFloor: new Float32Array(120),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.14,
      },
    )
    const before = Array.from(env.projectSpectrumRow(capturedRoomNoiseRows[1].values))
    let previous = capturedRoomNoiseRows[0].values
    for (const row of capturedRoomNoiseRows) {
      env.smoothed = Float32Array.from(row.values)
      env.bandFlux = diffFlux(row.values, previous)
      env.updateBandNoiseFloor()
      previous = row.values
    }
    const after = Array.from(env.projectSpectrumRow(capturedRoomNoiseRows[1].values))
    expect(mean(after, 20, 60)).toBeLessThan(mean(before, 20, 60))
    expect(mean(after, 108, 119)).toBeLessThan(mean(before, 108, 119))
  })

  test('production build keeps asset paths rooted for ./index.html', { timeout: 15000 }, async () => {
    await expect(buildOutputContainsProdPaths()).resolves.toBe(true)
  })

  test('production build inlines runtime dependencies without module imports', { timeout: 15000 }, async () => {
    await expect(buildOutputInlinesRuntimeWithoutImports()).resolves.toBe(true)
  })

  test('captured mic rows show the current left plateau and collapsed far-right tail', () => {
    const plateauRow = capturedRows[1].values
    const leftBody = mean(plateauRow, 8, 40)
    const farRightTail = mean(plateauRow, 100, 119)
    expect(leftBody).toBeGreaterThan(0.85)
    expect(farRightTail).toBeLessThan(0.02)
  })

  test('captured mic rows keep the full spectrum projected while still filling the far-right tail', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'findActiveSpectrumBounds', 'sampleSpectrumValue', 'remapSpectrumRow'],
      ['CONFIG'],
    )
    const values = capturedRows[1].values
    const [start, end] = env.findActiveSpectrumBounds(values)
    const remapped = env.remapSpectrumRow(values, start, end, env.CONFIG.laneCount)
    expect(start).toBe(0)
    expect(end).toBe(values.length - 1)
    expect(mean(remapped, 100, 119)).toBeLessThan(0.02)
  })

  test('active spectrum range stays stable when preserving the full projected spectrum', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'findActiveSpectrumBounds', 'updateActiveSpectrumRange'],
      ['CONFIG'],
      {
        activeSpectrumStart: 0,
        activeSpectrumEnd: 119,
      },
    )
    env.updateActiveSpectrumRange(capturedRows[1].values)
    expect(env.activeSpectrumStart).toBe(0)
    expect(env.activeSpectrumEnd).toBe(119)
  })

  test('captured spectrum bounds preserve the full weak tail instead of clipping it away', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'findActiveSpectrumBounds'],
      ['CONFIG'],
    )
    const row = capturedRows[1].values
    const [start, end] = env.findActiveSpectrumBounds(row)
    expect(start).toBe(0)
    expect(end).toBe(row.length - 1)
  })

  test('quiet captured rows still keep the full projected range', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'findActiveSpectrumBounds'],
      ['CONFIG'],
    )
    for (const row of capturedQuietRows) {
      const [start, end] = env.findActiveSpectrumBounds(row.values)
      expect(start).toBe(0)
      expect(end).toBeGreaterThanOrEqual(row.values.length - 8)
    }
  })

  test('quiet-to-loud captured rows adapt slowly instead of snapping the range', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'findActiveSpectrumBounds', 'updateActiveSpectrumRange'],
      ['CONFIG'],
      {
        activeSpectrumStart: 0,
        activeSpectrumEnd: 119,
      },
    )
    env.updateActiveSpectrumRange(capturedRows[1].values)
    const afterLoudEnd = env.activeSpectrumEnd
    env.updateActiveSpectrumRange(capturedQuietRows[1].values)
    expect(env.activeSpectrumEnd).toBeGreaterThan(afterLoudEnd - 6)
  })

  test('new captured rows reveal the red-purple tail flattening problem', () => {
    const tailRow = capturedTailFlatRows[1].values
    expect(mean(tailRow, 92, 103)).toBeLessThan(0.0001)
    expect(mean(tailRow, 108, 119)).toBeGreaterThan(0.02)
  })

  test('projected tail-flat captured rows keep visible red-purple occupancy through the dead zone', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity', 'sampleSpectrumValue', 'sampleProjectedSpectrum', 'applyProjectionFloor', 'projectSpectrumRow'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.14,
      },
    )
    const projected = Array.from(env.projectSpectrumRow(capturedTailFlatRows[1].values))
    expect(mean(projected, 92, 103)).toBeGreaterThan(0.015)
    expect(mean(projected, 108, 119)).toBeGreaterThan(0.12)
  })

  test('projected rows avoid dead zones across the whole width by design', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity', 'sampleSpectrumValue', 'sampleProjectedSpectrum', 'applyProjectionFloor', 'projectSpectrumRow'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.14,
      },
    )
    const projectedQuiet = Array.from(env.projectSpectrumRow(capturedQuietRows[1].values))
    const projectedTail = Array.from(env.projectSpectrumRow(capturedTailFlatRows[1].values))
    expect(mean(projectedQuiet, 0, 12)).toBeGreaterThan(0.02)
    expect(mean(projectedQuiet, 108, 119)).toBeGreaterThan(0.02)
    expect(mean(projectedTail, 92, 103)).toBeGreaterThan(0.05)
  })

  test('latest captured rows keep blue energy from pinning to the left border', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity', 'sampleSpectrumValue', 'sampleProjectedSpectrum', 'applyProjectionFloor', 'projectSpectrumRow'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.14,
      },
    )
    const projected = Array.from(env.projectSpectrumRow(capturedLatestRows[0].values))
    expect(mean(projected, 0, 3)).toBeLessThan(mean(projected, 4, 10) + 0.03)
  })

  test('latest captured rows keep red-purple occupancy alive despite a collapsing tail', async () => {
    const env = await loadVisualizerEnvironment(
      ['clamp', 'mix', 'smoothstep', 'spectrumTriplet', 'spectrumFloorFor', 'spectrumCeilingFor', 'stalenessDampingFor', 'applyBandSensitivity', 'sampleSpectrumValue', 'sampleProjectedSpectrum', 'applyProjectionFloor', 'projectSpectrumRow'],
      ['CONFIG'],
      {
        bandStaleness: new Float32Array(120),
        lowBandFloor: 0.06,
        lowBandCeiling: 0.24,
        midBandFloor: 0.045,
        midBandCeiling: 0.18,
        highBandFloor: 0.035,
        highBandCeiling: 0.14,
      },
    )
    const projected = Array.from(env.projectSpectrumRow(capturedLatestRows[1].values))
    expect(mean(projected, 108, 119)).toBeGreaterThan(0.04)
  })
})
