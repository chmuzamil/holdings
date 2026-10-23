import { useId, useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/Command'
import { useDialog } from '../ui/use-dialog'
import { buildCommandIndex, searchCommandIndex } from '../../lib/intelligence-helpers'
import './command-palette.css'

const TYPE_LABELS = {
  Project: 'Projects',
  Domain: 'Domains',
  Server: 'Servers',
  Repository: 'Repos',
  Account: 'Accounts',
  Subscription: 'Subscriptions',
}

export function CommandPalette({ open, onClose, records, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index) => `${baseId}-option-${index}`
  const dialogRef = useDialog({ open, onClose, initialFocus: 'input' })
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

  function choose(item) {
    onNavigate(item.moduleKey)
    onClose()
  }

  function onKeyDown(event) {
    if (!results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }

  if (!open) return null

  let globalIndex = 0

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <Command>
          <div className="command-palette-header">
            <Search size={16} aria-hidden="true" />
            <CommandInput
              value={query}
              onValueChange={(value) => {
                setQuery(value)
                setActiveIndex(0)
              }}
              placeholder="Search projects, domains, servers, repos…"
              role="combobox"
              aria-label="Search everything"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
            />
            <kbd className="command-kbd" aria-hidden="true">ESC</kbd>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {query ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
          </p>
          <CommandList id={listId} label="Results">
            {!results.length && (
              <CommandEmpty>Nothing found. Try a project, domain, server or repo name.</CommandEmpty>
            )}
            {Object.entries(grouped).map(([type, items]) => (
              <CommandGroup key={type} heading={TYPE_LABELS[type] || type}>
                {items.map((item) => {
                  const idx = globalIndex++
                  return (
                    <CommandItem key={item.id} id={optionId(idx)} active={idx === activeIndex} onSelect={() => choose(item)}>
                      <div className="command-item-copy">
                        <span className="command-item-type">{item.type}</span>
                        <strong>{item.name}</strong>
                        {item.subtitle && <small>{item.subtitle}</small>}
                      </div>
                      <span className="command-item-action" aria-hidden="true">
                        Open <ArrowRight size={13} />
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="command-palette-footer" aria-hidden="true">
            <span><kbd>↑↓</kbd> Move</span>
            <span><kbd>↵</kbd> Open</span>
            <span><kbd>Ctrl K</kbd> Open or close</span>
          </div>
        </Command>
      </div>
    </div>
  )
}
