import { PALETTE } from './config.js'
import { clamp, mix } from './math.js'

export function palette(u) {
    const x = clamp(u, 0, 0.9999) * (PALETTE.length - 1)
    const i = Math.floor(x)
    const f = x - i
    const a = PALETTE[i]
    const b = PALETTE[Math.min(i + 1, PALETTE.length - 1)]
    return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)]
}

export function rgb(color) {
    const r = Math.round(color[0] * 255)
    const g = Math.round(color[1] * 255)
    const b = Math.round(color[2] * 255)
    return `rgb(${r}, ${g}, ${b})`
}

export function mixColor(a, b, t) {
    return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
}

export function dominantSpectrumColor(values) {
    let total = 0
    const color = [0, 0, 0]
    for (let i = 0; i < values.length; i++) {
        const weight = values[i] * values[i]
        if (weight <= 0) continue
        const sample = palette(i / Math.max(1, values.length - 1))
        color[0] += sample[0] * weight
        color[1] += sample[1] * weight
        color[2] += sample[2] * weight
        total += weight
    }
    if (!total) return [0.14, 0.24, 0.42]
    return [color[0] / total, color[1] / total, color[2] / total]
}

export function tintBackgroundColor(color, strength) {
    const base = [0.01, 0.02, 0.05]
    const tint = [color[0] * 0.18, color[1] * 0.18, color[2] * 0.22]
    return mixColor(base, tint, strength)
}
