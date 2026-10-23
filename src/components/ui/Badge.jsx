// Tones only; callers map their own states to a tone (see lib/status.js).
// "default" and "expired" are kept as aliases for older call sites.
const variants = {
  neutral: 'ui-badge-default',
  default: 'ui-badge-default',
  info: 'ui-badge-info',
  success: 'ui-badge-success',
  warning: 'ui-badge-warning',
  danger: 'ui-badge-danger',
  expired: 'ui-badge-danger',
  outline: 'ui-badge-outline',
}

export function Badge({ variant = 'neutral', className = '', children }) {
  if (import.meta.env.DEV && !(variant in variants)) {
    console.warn(`Badge: unknown variant "${variant}"`)
  }
  return (
    <span className={`ui-badge ${variants[variant] || variants.neutral} ${className}`.trim()}>
      {children}
    </span>
  )
}
