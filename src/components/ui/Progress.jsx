export function Progress({ value = 0, className = '', color }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`ui-progress ${className}`.trim()} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="ui-progress-bar"
        style={{
          width: `${clamped}%`,
          ...(color ? { background: color } : {}),
        }}
      />
    </div>
  )
}
