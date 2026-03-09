export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v))
}

export function mix(a, b, t) {
    return a + (b - a) * t
}

export function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
}

export function wrappedPeak(t, center, width) {
    const delta = Math.abs(t - center)
    const distance = Math.min(delta, 1 - delta)
    const peak = clamp(1 - distance / width, 0, 1)
    return peak * peak
}
