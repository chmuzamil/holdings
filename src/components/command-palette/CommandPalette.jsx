import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/Command'
import { buildCommandIndex, searchCommandIndex } from '../../lib/intelligence-helpers'
import './command-palette.css'

const TYPE_LABELS = {
  Project: 'Projects',
  Domain: 'Domains',
  Server: 'Servers',
  Repository: 'Repositories',
  Account: 'Accounts',
  Subscription: 'Subscriptions',
}

export function CommandPalette({ open, onClose, records, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const index = useMemo(() => buildCommandIndex(records), [records])
  const results = useMemo(() => searchCommandIndex(index, query), [index, query])

  const grouped = useMemo(() => {
    const groups = {}
    results.forEach((item) => {
      if (!groups[item.type]) groups[item.type] = []
      groups[item.type].push(item)
    })
    return groups
  }, [results])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (!results.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % results.length)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + results.length) % results.length)
      }
      if (event.key === 'Enter' && results[activeIndex]) {
        event.preventDefault()
        onNavigate(results[activeIndex].moduleKey)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, results, activeIndex, onNavigate, onClose])

  if (!open) return null

  let globalIndex = 0

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <Command>
          <div className="command-palette-header">
            <Search size={16} />
            <CommandInput
              value={query}
              onValueChange={(value) => {
                setQuery(value)
                setActiveIndex(0)
              }}
              placeholder="Search projects, domains, servers, repos..."
            />
            <kbd className="command-kbd">ESC</kbd>
          </div>
          <CommandList>
            {!results.length && (
              <CommandEmpty>No results found. Try newsbite, Founder OS, or Main VPS.</CommandEmpty>
            )}
            {Object.entries(grouped).map(([type, items]) => (
              <CommandGroup key={type} heading={TYPE_LABELS[type] || type}>
                {items.map((item) => {
                  const idx = globalIndex++
                  return (
                    <CommandItem
                      key={item.id}
                      active={idx === activeIndex}
                      onSelect={() => {
                        onNavigate(item.moduleKey)
                        onClose()
                      }}
                    >
                      <div className="command-item-copy">
                        <span className="command-item-type">{item.type}</span>
                        <strong>{item.name}</strong>
                        {item.subtitle && <small>{item.subtitle}</small>}
                      </div>
                      <span className="command-item-action">
                        Open <ArrowRight size={13} />
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="command-palette-footer">
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Open</span>
            <span><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd></span>
          </div>
        </Command>
      </div>
    </div>
  )
}
