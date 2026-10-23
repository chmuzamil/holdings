// Whole percentages that always add up to exactly 100 (largest-remainder
// rounding). Values of zero get 0; a non-zero value that rounds to 0 is
// flagged as `tiny` so it can be shown as "<1%".
export function percentShares(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (!total) return values.map(() => ({ percent: 0, tiny: false }))

  const raw = values.map((value) => (Math.max(0, value) / total) * 100)
  const floors = raw.map(Math.floor)
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of order) {
    if (remaining <= 0) break
    floors[index] += 1
    remaining -= 1
  }
  return floors.map((percent, index) => ({ percent, tiny: percent === 0 && values[index] > 0 }))
}

export function percentLabel({ percent, tiny }) {
  return tiny ? '<1%' : `${percent}%`
}
