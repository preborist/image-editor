import type { EditOperation } from './operations'

/**
 * Exhaustiveness guard. Calling this in a switch's `default` makes the compiler
 * fail if a new EditOperation variant is added but not handled.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled operation variant: ${JSON.stringify(value)}`)
}

/** Generate a stable, unique operation id. */
export function createOpId(type: EditOperation['type']): string {
  const randomIdentifierSuffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${type}_${randomIdentifierSuffix}`
}
