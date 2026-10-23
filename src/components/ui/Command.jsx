export function Command({ children, className = '' }) {
  return <div className={`ui-command ${className}`.trim()}>{children}</div>
}

// Focus is set by the surrounding dialog; extra props carry the combobox ARIA.
export function CommandInput({ value, onValueChange, placeholder = 'Search…', ...props }) {
  return (
    <div className="ui-command-input-wrap">
      <input
        className="ui-command-input"
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        {...props}
      />
    </div>
  )
}

export function CommandList({ children, id, label }) {
  return <div className="ui-command-list" id={id} role="listbox" aria-label={label}>{children}</div>
}

export function CommandEmpty({ children }) {
  return <div className="ui-command-empty">{children}</div>
}

export function CommandGroup({ heading, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return (
    <div className="ui-command-group" role="group" aria-label={heading}>
      {heading && <div className="ui-command-group-heading" aria-hidden="true">{heading}</div>}
      <div className="ui-command-group-items">{children}</div>
    </div>
  )
}

export function CommandItem({ id, onSelect, children, active }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={`ui-command-item ${active ? 'active' : ''}`.trim()}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
