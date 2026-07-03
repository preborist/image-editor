import { computed, inject, type InjectionKey, provide, reactive, ref, watch } from 'vue'

import { useEditorStore } from '../store/editor'
import { transformedSize } from './renderPipeline'

/**
 * Shared, ephemeral state for an active crop session. Provided by the editor
 * shell so both the on-canvas overlay (geometry/drag) and the sidebar controls
 * (ratio presets, width/height inputs) mutate one source of truth.
 *
 * The crop rectangle is stored in NORMALIZED coords (0..1) over the full
 * original, so it is independent of the preview's display scale and maps
 * directly to source pixels. All ratio math here is in source-pixel space.
 */

export type CropUnit = 'px' | 'in' | 'cm' | 'mm'

interface Preset {
  key: string
  title: string
  width?: number
  height?: number // undefined width/height => use the image's own ratio
}

export const CROP_PRESETS: Preset[] = [
  { key: 'original', title: 'Original' },
  { key: '1x1', title: '1 × 1 (square)', width: 1, height: 1 },
  { key: '16x9', title: '16 × 9', width: 16, height: 9 },
  { key: '2x3', title: '2 × 3', width: 2, height: 3 },
  { key: '3x5', title: '3 × 5', width: 3, height: 5 },
  { key: '4x3', title: '4 × 3', width: 4, height: 3 },
  { key: '4x5', title: '4 × 5', width: 4, height: 5 },
  { key: '4x6', title: '4 × 6', width: 4, height: 6 },
  { key: '5x7', title: '5 × 7', width: 5, height: 7 },
  { key: '5x8', title: '5 × 8', width: 5, height: 8 },
  { key: '8x10', title: '8 × 10', width: 8, height: 10 },
  { key: 'wallet', title: 'Wallet (2.5 × 3.5)', width: 2.5, height: 3.5 },
]

/** Assumed print resolution for converting pixels to physical units. */
export const CROP_DOTS_PER_INCH = 300

const MINIMUM_SOURCE_PIXELS = 8
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

function createCropSession() {
  const editorStore = useEditorStore()

  const cropRectangle = reactive({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  const shouldConstrainProportions = ref(false)
  const presetKey = ref('original')
  const isRatioRotated = ref(false)
  const measurementUnit = ref<CropUnit>('px')

  // Crop is selected on the TRANSFORMED (previewed) image, so dimensions and
  // committed coordinates are in the oriented image's pixel space — a 90° rotate
  // swaps width/height here.
  const transformedDimensions = computed(() =>
    editorStore.original
      ? transformedSize(editorStore.original, editorStore.operations)
      : { width: 0, height: 0 },
  )
  const sourceWidth = computed(() => transformedDimensions.value.width)
  const sourceHeight = computed(() => transformedDimensions.value.height)

  const baseRatio = computed(() => {
    const preset =
      CROP_PRESETS.find((candidatePreset) => candidatePreset.key === presetKey.value) ??
      CROP_PRESETS[0]!
    if (preset.width != null && preset.height != null) return preset.width / preset.height
    return sourceWidth.value && sourceHeight.value ? sourceWidth.value / sourceHeight.value : 1
  })

  /** Active enforced ratio (width/height) in source pixels, or null when free. */
  const ratio = computed<number | null>(() =>
    shouldConstrainProportions.value
      ? isRatioRotated.value
        ? 1 / baseRatio.value
        : baseRatio.value
      : null,
  )

  /** Current crop size in source pixels. */
  const widthPixels = computed(() => Math.round(cropRectangle.width * sourceWidth.value))
  const heightPixels = computed(() => Math.round(cropRectangle.height * sourceHeight.value))

  /** Seed from an existing crop op (or a sensible inset default) and reset UI. */
  function seedFromStore() {
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    const cropOperation = editorStore.operations.find((operation) => operation.type === 'crop')
    if (cropOperation && sourceWidthPixels && sourceHeightPixels) {
      cropRectangle.x = cropOperation.parameters.x / sourceWidthPixels
      cropRectangle.y = cropOperation.parameters.y / sourceHeightPixels
      cropRectangle.width = cropOperation.parameters.width / sourceWidthPixels
      cropRectangle.height = cropOperation.parameters.height / sourceHeightPixels
    } else {
      cropRectangle.x = 0.1
      cropRectangle.y = 0.1
      cropRectangle.width = 0.8
      cropRectangle.height = 0.8
    }
    shouldConstrainProportions.value = false
    presetKey.value = 'original'
    isRatioRotated.value = false
  }

  /** Commit the current selection to the store as a crop op (in transformed px). */
  function commit() {
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    if (!sourceWidthPixels || !sourceHeightPixels) return
    // A full-image selection means "no crop" — drop any existing crop op.
    if (
      cropRectangle.x <= 0.001 &&
      cropRectangle.y <= 0.001 &&
      cropRectangle.width >= 0.999 &&
      cropRectangle.height >= 0.999
    ) {
      editorStore.removeCrop()
      return
    }
    editorStore.upsertCrop({
      x: Math.round(cropRectangle.x * sourceWidthPixels),
      y: Math.round(cropRectangle.y * sourceHeightPixels),
      width: Math.round(cropRectangle.width * sourceWidthPixels),
      height: Math.round(cropRectangle.height * sourceHeightPixels),
    })
  }

  /** Reshape the box to the active ratio, keeping its center fixed. */
  function reshapeToRatio() {
    const activeRatio = ratio.value
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    if (!activeRatio || !sourceWidthPixels || !sourceHeightPixels) return
    const centerX = cropRectangle.x + cropRectangle.width / 2
    const centerY = cropRectangle.y + cropRectangle.height / 2
    let normalizedWidth = cropRectangle.width
    let normalizedHeight =
      (cropRectangle.width * sourceWidthPixels) / activeRatio / sourceHeightPixels
    const maximumNormalizedWidth = 2 * Math.min(centerX, 1 - centerX)
    const maximumNormalizedHeight = 2 * Math.min(centerY, 1 - centerY)
    if (normalizedWidth > maximumNormalizedWidth) {
      normalizedWidth = maximumNormalizedWidth
      normalizedHeight = (normalizedWidth * sourceWidthPixels) / activeRatio / sourceHeightPixels
    }
    if (normalizedHeight > maximumNormalizedHeight) {
      normalizedHeight = maximumNormalizedHeight
      normalizedWidth = (normalizedHeight * sourceHeightPixels * activeRatio) / sourceWidthPixels
    }
    cropRectangle.x = centerX - normalizedWidth / 2
    cropRectangle.y = centerY - normalizedHeight / 2
    cropRectangle.width = normalizedWidth
    cropRectangle.height = normalizedHeight
  }

  /** Largest centered box of the active ratio (or the whole image if free). */
  function selectAll() {
    const activeRatio = ratio.value
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    if (!activeRatio || !sourceWidthPixels || !sourceHeightPixels) {
      cropRectangle.x = 0
      cropRectangle.y = 0
      cropRectangle.width = 1
      cropRectangle.height = 1
      return
    }
    let cropWidthPixels = sourceWidthPixels
    let cropHeightPixels = cropWidthPixels / activeRatio
    if (cropHeightPixels > sourceHeightPixels) {
      cropHeightPixels = sourceHeightPixels
      cropWidthPixels = cropHeightPixels * activeRatio
    }
    cropRectangle.width = cropWidthPixels / sourceWidthPixels
    cropRectangle.height = cropHeightPixels / sourceHeightPixels
    cropRectangle.x = (1 - cropRectangle.width) / 2
    cropRectangle.y = (1 - cropRectangle.height) / 2
  }

  /** Set crop width (source px), anchored at the current top-left corner. */
  function setSourceWidth(pixels: number) {
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    if (!sourceWidthPixels || !sourceHeightPixels) return
    let normalizedWidth = clamp(
      pixels / sourceWidthPixels,
      MINIMUM_SOURCE_PIXELS / sourceWidthPixels,
      1 - cropRectangle.x,
    )
    const activeRatio = ratio.value
    if (activeRatio) {
      let normalizedHeight =
        (normalizedWidth * sourceWidthPixels) / activeRatio / sourceHeightPixels
      if (cropRectangle.y + normalizedHeight > 1) {
        normalizedHeight = 1 - cropRectangle.y
        normalizedWidth = (normalizedHeight * sourceHeightPixels * activeRatio) / sourceWidthPixels
      }
      cropRectangle.height = normalizedHeight
    }
    cropRectangle.width = normalizedWidth
  }

  /** Set crop height (source px), anchored at the current top-left corner. */
  function setSourceHeight(pixels: number) {
    const sourceWidthPixels = sourceWidth.value
    const sourceHeightPixels = sourceHeight.value
    if (!sourceWidthPixels || !sourceHeightPixels) return
    let normalizedHeight = clamp(
      pixels / sourceHeightPixels,
      MINIMUM_SOURCE_PIXELS / sourceHeightPixels,
      1 - cropRectangle.y,
    )
    const activeRatio = ratio.value
    if (activeRatio) {
      let normalizedWidth =
        (normalizedHeight * sourceHeightPixels * activeRatio) / sourceWidthPixels
      if (cropRectangle.x + normalizedWidth > 1) {
        normalizedWidth = 1 - cropRectangle.x
        normalizedHeight = (normalizedWidth * sourceWidthPixels) / activeRatio / sourceHeightPixels
      }
      cropRectangle.width = normalizedWidth
    }
    cropRectangle.height = normalizedHeight
  }

  // Reflow the box to the active ratio whenever the constraint changes, no
  // matter which control (sidebar select, rotate button, toggle) triggered it.
  watch([shouldConstrainProportions, presetKey, isRatioRotated], () => {
    if (shouldConstrainProportions.value) reshapeToRatio()
  })

  return {
    cropRectangle,
    shouldConstrainProportions,
    presetKey,
    isRatioRotated,
    measurementUnit,
    ratio,
    sourceWidth,
    sourceHeight,
    widthPixels,
    heightPixels,
    seedFromStore,
    commit,
    reshapeToRatio,
    selectAll,
    setSourceWidth,
    setSourceHeight,
  }
}

export type CropSession = ReturnType<typeof createCropSession>

const CropSessionKey: InjectionKey<CropSession> = Symbol('crop-session')

/** Create and provide a crop session (call once in the editor shell). */
export function provideCropSession(): CropSession {
  const session = createCropSession()
  provide(CropSessionKey, session)
  return session
}

/** Inject the shared crop session. */
export function useCropSession(): CropSession {
  const session = inject(CropSessionKey)
  if (!session) throw new Error('Crop session not provided')
  return session
}

// --- Unit conversion --------------------------------------------------------

export function pxToUnit(pixels: number, unit: CropUnit): number {
  if (unit === 'px') return pixels
  const inches = pixels / CROP_DOTS_PER_INCH
  if (unit === 'in') return inches
  if (unit === 'cm') return inches * 2.54
  return inches * 25.4 // mm
}

export function unitToPx(value: number, unit: CropUnit): number {
  if (unit === 'px') return value
  const inches = unit === 'in' ? value : unit === 'cm' ? value / 2.54 : value / 25.4
  return inches * CROP_DOTS_PER_INCH
}
