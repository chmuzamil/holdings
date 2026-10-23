import { useEffect, useRef, useState } from 'react'

/**
 * Open/close state and keyboard handling for a button that opens a menu:
 * the first item gets focus on open, arrow keys / Home / End move between
 * items, Escape closes and returns focus to the button, and clicking or
 * tabbing away closes it.
 */
export function useMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])]
    items()[0]?.focus()

    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    function onKeyDown(event) {
      const list = items()
      const index = list.indexOf(document.activeElement)
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        list[(index + 1) % list.length]?.focus()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        list[(index - 1 + list.length) % list.length]?.focus()
      } else if (event.key === 'Home') {
        event.preventDefault()
        list[0]?.focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        list[list.length - 1]?.focus()
      } else if (event.key === 'Tab') {
        setOpen(false)
      }
    }

    const root = rootRef.current
    document.addEventListener('mousedown', onPointer)
    root?.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      root?.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Close and put focus back on the button, so anything the item opens (a
  // dialog) returns focus there afterwards.
  function closeAndRefocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return {
    open,
    setOpen,
    closeAndRefocus,
    rootRef,
    menuRef,
    triggerProps: {
      ref: triggerRef,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      onClick: () => setOpen((current) => !current),
    },
  }
}
