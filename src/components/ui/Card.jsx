export function Card({ className = '', children, ...props }) {
  return (
    <div className={`ui-card ${className}`.trim()} {...props}>
      {children}
    </div>
  )
}
