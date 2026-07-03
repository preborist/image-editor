import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { type ImageSource, remapCrop } from '../composables/renderPipeline'
import {
  ADJUST_IDENTITY,
  type AdjustParams,
  createOpId,
  type CropParams,
  type EditOperation,
  type FilterName,
  isTransformIdentity,
  MAXIMUM_FINE_ANGLE,
  MINIMUM_FINE_ANGLE,
  OPERATIONS_DOCUMENT_VERSION,
  type OpsDocument,
  type SourceInfo,
  TRANSFORM_IDENTITY,
  type TransformParams,
} from '../types'

// Canonical apply order (transform → crop → adjust → filter). Crop is defined in
// the transformed image's pixel space so cropping the previewed (already
// oriented) image is 1:1; when the transform changes, the crop rect is remapped
// (see remapCrop) so it keeps covering the same content.
const TYPE_ORDER: Record<EditOperation['type'], number> = {
  transform: 0,
  crop: 1,
  adjust: 2,
  filter: 3,
}

export const useEditorStore = defineStore('editor', () => {
  // The immutable decoded original. shallowRef: it's an opaque bitmap, not deep
  // reactive, and it is NEVER drawn to — only ever read as a draw source.
  const original = shallowRef<ImageSource | null>(null)
  const sourceInformation = ref<SourceInfo | null>(null)

  // The operation stack. Deleting everything here restores the original.
  const operations = ref<EditOperation[]>([])

  // Undo/redo: snapshots of the whole (small) op stack. `past` grows as edits
  // are made; `future` holds undone states until a new edit clears it.
  const undoHistory = ref<EditOperation[][]>([])
  const redoHistory = ref<EditOperation[][]>([])

  const hasImage = computed(() => original.value !== null)
  const canUndo = computed(() => undoHistory.value.length > 0)
  const canRedo = computed(() => redoHistory.value.length > 0)

  const cloneOperations = (operationList: EditOperation[]) =>
    JSON.parse(JSON.stringify(operationList)) as EditOperation[]

  /** Current adjustment values (identity when no adjust op is present). */
  const adjustment = computed<AdjustParams>(() => {
    const operation = operations.value.find(
      (candidateOperation) => candidateOperation.type === 'adjust',
    )
    return operation ? { ...operation.parameters } : { ...ADJUST_IDENTITY }
  })

  /** Set of currently active filter names. */
  const activeFilters = computed<Set<FilterName>>(
    () =>
      new Set(
        operations.value
          .filter((operation) => operation.type === 'filter')
          .map((operation) => operation.parameters.name),
      ),
  )

  /** Current transform state (identity when no transform op is present). */
  const transform = computed<TransformParams>(() => {
    const operation = operations.value.find(
      (candidateOperation) => candidateOperation.type === 'transform',
    )
    return operation ? { ...operation.parameters } : { ...TRANSFORM_IDENTITY }
  })

  function sortOps() {
    operations.value.sort(
      (firstOperation, secondOperation) =>
        TYPE_ORDER[firstOperation.type] - TYPE_ORDER[secondOperation.type],
    )
  }

  /**
   * Push the current op stack onto the undo history and clear the redo branch.
   * Discrete actions call this themselves; continuous actions (slider drags)
   * call `snapshot()` once from the UI at interaction start instead.
   */
  function snapshot() {
    undoHistory.value.push(cloneOperations(operations.value))
    if (undoHistory.value.length > 100) undoHistory.value.shift()
    redoHistory.value = []
  }

  function undo() {
    const previousOperations = undoHistory.value.pop()
    if (!previousOperations) return
    redoHistory.value.push(cloneOperations(operations.value))
    operations.value = previousOperations
  }

  function redo() {
    const nextOperations = redoHistory.value.pop()
    if (!nextOperations) return
    undoHistory.value.push(cloneOperations(operations.value))
    operations.value = nextOperations
  }

  function clearHistory() {
    undoHistory.value = []
    redoHistory.value = []
  }

  /** Replace the immutable original and clear all edits and history. */
  function setOriginal(source: ImageSource, newSourceInformation: SourceInfo) {
    original.value = source
    sourceInformation.value = newSourceInformation
    operations.value = []
    clearHistory()
  }

  /** Upsert the single crop op. */
  function upsertCrop(parameters: CropParams) {
    snapshot()
    const existingOperation = operations.value.find((operation) => operation.type === 'crop')
    if (existingOperation) {
      existingOperation.parameters = { ...parameters }
    } else {
      operations.value.push({
        id: createOpId('crop'),
        type: 'crop',
        parameters: { ...parameters },
      })
    }
    sortOps()
  }

  function removeCrop() {
    if (!operations.value.some((operation) => operation.type === 'crop')) return
    snapshot()
    operations.value = operations.value.filter((operation) => operation.type !== 'crop')
  }

  /** Upsert the single adjust op. Continuous — UI snapshots at drag start. */
  function upsertAdjust(parameters: AdjustParams) {
    const existingOperation = operations.value.find((operation) => operation.type === 'adjust')
    if (existingOperation) {
      existingOperation.parameters = { ...parameters }
    } else {
      operations.value.push({
        id: createOpId('adjust'),
        type: 'adjust',
        parameters: { ...parameters },
      })
    }
    sortOps()
  }

  /** Turn a filter on/off. One op per filter name. */
  function setFilter(name: FilterName, enabled: boolean, amount = 1) {
    snapshot()
    if (enabled) {
      const existingOperation = operations.value.find(
        (operation) => operation.type === 'filter' && operation.parameters.name === name,
      )
      if (existingOperation) {
        existingOperation.parameters = { name, amount }
      } else {
        operations.value.push({
          id: createOpId('filter'),
          type: 'filter',
          parameters: { name, amount },
        })
      }
      sortOps()
    } else {
      operations.value = operations.value.filter(
        (operation) => !(operation.type === 'filter' && operation.parameters.name === name),
      )
    }
  }

  /** Merge params into the single transform op; drop it when back to identity. */
  function upsertTransform(transformUpdate: Partial<TransformParams>) {
    const existingOperation = operations.value.find((operation) => operation.type === 'transform')
    const previousTransform: TransformParams = existingOperation
      ? { ...existingOperation.parameters }
      : { ...TRANSFORM_IDENTITY }
    const nextTransform: TransformParams = { ...previousTransform, ...transformUpdate }

    // A crop is stored in the transformed image's pixels; remap it so it keeps
    // covering the same content across a flip / 90° rotation. Fine-angle changes
    // are skipped so a straighten drag doesn't accumulate bounding-box growth
    // (the crop frame stays put while the image rotates under it).
    const hasDiscreteTransformChange =
      previousTransform.rotate90 !== nextTransform.rotate90 ||
      previousTransform.mirrorHorizontal !== nextTransform.mirrorHorizontal ||
      previousTransform.mirrorVertical !== nextTransform.mirrorVertical
    const cropOperation = operations.value.find((operation) => operation.type === 'crop')
    if (hasDiscreteTransformChange && cropOperation && sourceInformation.value) {
      cropOperation.parameters = remapCrop(
        cropOperation.parameters,
        sourceInformation.value.width,
        sourceInformation.value.height,
        previousTransform,
        nextTransform,
      )
    }

    if (isTransformIdentity(nextTransform)) {
      operations.value = operations.value.filter((operation) => operation.type !== 'transform')
      return
    }
    if (existingOperation) {
      existingOperation.parameters = nextTransform
    } else {
      operations.value.push({
        id: createOpId('transform'),
        type: 'transform',
        parameters: nextTransform,
      })
    }
    sortOps()
  }

  /** Toggle a mirror axis (discrete — records history). */
  function mirror(axis: 'h' | 'v') {
    snapshot()
    upsertTransform(
      axis === 'h'
        ? { mirrorHorizontal: !transform.value.mirrorHorizontal }
        : { mirrorVertical: !transform.value.mirrorVertical },
    )
  }

  /** Rotate in 90° steps (discrete — records history). */
  function rotate90(direction: 'cw' | 'ccw') {
    snapshot()
    const step = direction === 'cw' ? 1 : 3
    upsertTransform({ rotate90: ((transform.value.rotate90 + step) % 4) as 0 | 1 | 2 | 3 })
  }

  /** Fine rotation in degrees. Continuous — UI snapshots at drag start. */
  function setFineAngle(degrees: number) {
    if (!Number.isFinite(degrees)) return

    const boundedDegrees = Math.min(
      MAXIMUM_FINE_ANGLE,
      Math.max(MINIMUM_FINE_ANGLE, Math.round(degrees)),
    )
    upsertTransform({ fineAngle: boundedDegrees })
  }

  /** Reset — clear the whole stack and history, restoring the original. */
  function resetOps() {
    operations.value = []
    clearHistory()
  }

  /** Unload the current image entirely (return to the upload screen). */
  function clear() {
    original.value = null
    sourceInformation.value = null
    operations.value = []
    clearHistory()
  }

  /** Build the versioned, replayable export document. */
  function toDocument(): OpsDocument {
    if (!sourceInformation.value) throw new Error('No image loaded')
    return {
      version: OPERATIONS_DOCUMENT_VERSION,
      source: { ...sourceInformation.value },
      // Deep clone so the exported document is a detached snapshot.
      operations: JSON.parse(JSON.stringify(operations.value)) as EditOperation[],
    }
  }

  return {
    original,
    sourceInformation,
    operations,
    hasImage,
    canUndo,
    canRedo,
    adjustment,
    activeFilters,
    transform,
    setOriginal,
    upsertCrop,
    removeCrop,
    upsertAdjust,
    setFilter,
    upsertTransform,
    mirror,
    rotate90,
    setFineAngle,
    snapshot,
    undo,
    redo,
    resetOps,
    clear,
    toDocument,
  }
})
