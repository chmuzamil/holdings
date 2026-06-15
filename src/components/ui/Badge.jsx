const variants = {
  default: 'ui-badge-default',
  success: 'ui-badge-success',
  warning: 'ui-badge-warning',
  danger: 'ui-badge-danger',
  expired: 'ui-badge-expired',
  outline: 'ui-badge-outline',
}

export function Badge({ variant = 'default', className = '', children }) {
  return (
    <span className={`ui-badge ${variants[variant] || variants.default} ${className}`.trim()}>
      {children}
    </span>
  )
}
