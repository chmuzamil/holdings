import { useEffect, useRef } from 'react'

export function Command({ children, className = '' }) {
  return <div className={`ui-command ${className}`.trim()}>{children}</div>
}

export function CommandInput({ value, onValueChange, placeholder = 'Search...' }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="ui-command-input-wrap">
      <input
        ref={ref}
        className="ui-command-input"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )
}

export function CommandList({ children }) {
  return <div className="ui-command-list">{children}</div>
}

export function CommandEmpty({ children }) {
  return <div className="ui-command-empty">{children}</div>
}

export function CommandGroup({ heading, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return (
    <div className="ui-command-group">
      {heading && <div className="ui-command-group-heading">{heading}</div>}
      <div className="ui-command-group-items">{children}</div>
    </div>
  )
}

export function CommandItem({ onSelect, children, active }) {
  return (
    <button
      type="button"
      className={`ui-command-item ${active ? 'active' : ''}`.trim()}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}
