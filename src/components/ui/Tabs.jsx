import { useId, useRef, useState } from 'react'

export function Tabs({ defaultValue, items }) {
  const [active, setActive] = useState(defaultValue || items[0]?.value)
  const baseId = useId()
  const listRef = useRef(null)
  const tabId = (value) => `${baseId}-tab-${value}`
  const panelId = (value) => `${baseId}-panel-${value}`

  function onKeyDown(event) {
    const index = items.findIndex((item) => item.value === active)
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = items[(moves[event.key] + items.length) % items.length]
    setActive(next.value)
    listRef.current?.querySelector(`#${CSS.escape(tabId(next.value))}`)?.focus()
  }

  return (
    <div className="ui-tabs">
      <div className="ui-tabs-list" role="tablist" ref={listRef} onKeyDown={onKeyDown}>
        {items.map((item) => (
          <button
            key={item.value}
            id={tabId(item.value)}
            type="button"
            role="tab"
            className="ui-tabs-trigger"
            data-active={active === item.value}
            aria-selected={active === item.value}
            aria-controls={panelId(item.value)}
            tabIndex={active === item.value ? 0 : -1}
            onClick={() => setActive(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ui-tabs-content" role="tabpanel" id={panelId(active)} aria-labelledby={tabId(active)} tabIndex={0}>
        {items.find((item) => item.value === active)?.content}
      </div>
    </div>
  )
}
