import { useState } from 'react'

export function Tabs({ defaultValue, items }) {
  const [active, setActive] = useState(defaultValue || items[0]?.value)

  return (
    <div className="ui-tabs">
      <div className="ui-tabs-list" role="tablist">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            className="ui-tabs-trigger"
            data-active={active === item.value}
            aria-selected={active === item.value}
            onClick={() => setActive(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ui-tabs-content">
        {items.find((item) => item.value === active)?.content}
      </div>
    </div>
  )
}
