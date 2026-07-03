import { onBeforeUnmount, onMounted } from 'vue'

import { useEditorStore } from '../store/editor'

/** True when focus is in a field where the shortcut should defer to the input. */
function isTypingTarget(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  const tagName = element.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    element.isContentEditable
  )
}

/** Register global undo/redo keyboard shortcuts for the lifetime of the caller. */
export function useEditorShortcuts() {
  const store = useEditorStore()

  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return
    if (isTypingTarget(event.target)) return

    const shouldRedo =
      event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)
    event.preventDefault()
    if (shouldRedo) store.redo()
    else store.undo()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
