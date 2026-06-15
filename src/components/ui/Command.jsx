import { useEffect, useRef, useState } from 'react'

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

export function CommandItem({ value, onSelect, children, active }) {
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

export function useCommandState(items, onSelect) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    function onKeyDown(event) {
      if (!items.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % items.length)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
      }
      if (event.key === 'Enter' && items[activeIndex]) {
        event.preventDefault()
        onSelect(items[activeIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, activeIndex, onSelect])

  return { query, setQuery, activeIndex, setActiveIndex }
}
