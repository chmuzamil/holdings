import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
}

/**
 * Makes an element behave like a modal dialog for keyboard users: focus moves
 * inside when it opens (to `initialFocus`, a CSS selector, or the first
 * focusable element), Tab stays inside, Escape calls `onClose`, and focus
 * goes back to where it was when the dialog closes.
 */
export function useDialog({ open = true, onClose, initialFocus } = {}) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const node = ref.current
    if (!open || !node) return undefined
    const previous = document.activeElement

    const target = (initialFocus && node.querySelector(initialFocus)) || focusables(node)[0] || node
    target.focus({ preventScroll: true })

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables(node)
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open, initialFocus])

  return ref
}
