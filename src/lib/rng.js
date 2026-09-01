// Deterministic PRNG so the demo dataset is identical on every machine/run.
export function makeRng(seed = 1337) {
  let s = seed >>> 0
  return function rng() {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
export const R = makeRng(20260827)
export const pick = (arr) => arr[Math.floor(R() * arr.length)]
export const pickN = (arr, n) => {
  const c = [...arr]
  const out = []
  // `want` is fixed up front: c.length shrinks as we splice, so re-evaluating
  // Math.min(n, c.length) inside the condition stops the loop around n/2.
  const want = Math.min(n, c.length)
  while (out.length < want) out.push(c.splice(Math.floor(R() * c.length), 1)[0])
  return out
}
export const int = (min, max) => Math.floor(R() * (max - min + 1)) + min
export const float = (min, max, dp = 2) => +(R() * (max - min) + min).toFixed(dp)
export const chance = (p) => R() < p
export const weighted = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  let t = R() * total
  for (const [v, w] of pairs) { if ((t -= w) <= 0) return v }
  return pairs[pairs.length - 1][0]
}
