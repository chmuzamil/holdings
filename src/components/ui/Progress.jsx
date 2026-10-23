export function Progress({ value = 0, className = '', color, label, valueText }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`ui-progress ${className}`.trim()}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={valueText}
    >
      <div
        className="ui-progress-bar"
        style={{
          // A small non-zero value still gets a visible sliver.
          width: clamped > 0 ? `max(${clamped}%, 3px)` : 0,
          ...(color ? { background: color } : {}),
        }}
      />
    </div>
  )
}
