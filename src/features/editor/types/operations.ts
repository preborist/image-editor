// =============================================================================
// Operation model — the heart of the non-destructive editor.
//
// Editor state is { original, ops }. The rendered image is a pure function
// render(original, ops). Every op here is JSON-serializable so the exact edit
// can be exported and replayed. No `any` anywhere in this module.
// =============================================================================

/** Supported filter names. Extend the union to add filters. */
export type FilterName = 'grayscale' | 'sepia'

/** Crop rectangle expressed in ORIGINAL source pixels (not preview pixels). */
export interface CropParams {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Normalized adjustment params. Defaults are the identity (see ADJUST_IDENTITY):
 * 0 means "no change". Ranges are UI-facing normalized units, mapped to the
 * canvas filter string in exactly one place (the render pipeline).
 *   brightness/contrast: -100..100  (0 = unchanged)
 *   saturation:          -100..100  (0 = unchanged)
 */
export interface AdjustParams {
  brightness: number
  contrast: number
  saturation: number
}

/** Filter params. `amount` is 0..1 (1 = fully applied). */
export interface FilterParams {
  name: FilterName
  amount: number
}

/**
 * Combined orientation state. Applied before crop, so crop coordinates live in
 * the transformed image's pixel space. Identity = TRANSFORM_IDENTITY.
 *   rotate90:  number of 90° clockwise quarter-turns (0..3)
 *   fineAngle: additional rotation in degrees (e.g. straighten), 1° steps
 *   mirrorHorizontal/mirrorVertical: flip horizontally / vertically
 */
export interface TransformParams {
  rotate90: 0 | 1 | 2 | 3
  fineAngle: number
  mirrorHorizontal: boolean
  mirrorVertical: boolean
}

interface BaseOp<OperationType extends string, OperationParameters> {
  id: string
  type: OperationType
  parameters: OperationParameters
}

export type CropOp = BaseOp<'crop', CropParams>
export type AdjustOp = BaseOp<'adjust', AdjustParams>
export type FilterOp = BaseOp<'filter', FilterParams>
export type TransformOp = BaseOp<'transform', TransformParams>

/** Serializable discriminated union of all edit operations. */
export type EditOperation = TransformOp | CropOp | AdjustOp | FilterOp

export type EditOperationType = EditOperation['type']

/** Metadata about the immutable source, recorded in the exported document. */
export interface SourceInfo {
  name: string
  width: number
  height: number
}

/** Versioned, portable export document. Replay `ops` in order to reproduce. */
export interface OpsDocument {
  version: 1
  source: SourceInfo
  operations: EditOperation[]
}

export const OPERATIONS_DOCUMENT_VERSION = 1 as const

/** Identity adjustment — produces no visible change. */
export const ADJUST_IDENTITY: AdjustParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
}

/** Identity transform — produces no visible change. */
export const TRANSFORM_IDENTITY: TransformParams = {
  rotate90: 0,
  fineAngle: 0,
  mirrorHorizontal: false,
  mirrorVertical: false,
}

export const MINIMUM_FINE_ANGLE = -180
export const MAXIMUM_FINE_ANGLE = 180

/** True when a transform has no visible effect. */
export function isTransformIdentity(transformParameters: TransformParams): boolean {
  return (
    transformParameters.rotate90 === 0 &&
    transformParameters.fineAngle === 0 &&
    !transformParameters.mirrorHorizontal &&
    !transformParameters.mirrorVertical
  )
}
