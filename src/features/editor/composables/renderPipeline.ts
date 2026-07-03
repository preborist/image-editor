// =============================================================================
// The single render pipeline used for BOTH preview and export.
//
// render(source, operations, scale) is a pure function of its inputs — it never
// mutates `source`. Preview calls it at a fit-to-viewport scale; export calls
// it at scale 1 (full resolution). One code path => preview === export.
// =============================================================================

import type { AdjustParams, EditOperation, FilterOp, TransformParams } from '../types'
import { assertNever, TRANSFORM_IDENTITY } from '../types'

/** Anything we can hand to CanvasRenderingContext2D.drawImage as a source. */
export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement

export interface Size {
  width: number
  height: number
}

/** Intrinsic pixel size of a source, regardless of CSS layout size. */
export function intrinsicSize(source: ImageSource): Size {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

// --- Op selection ------------------------------------------------------------

function findCrop(operations: EditOperation[]) {
  return operations.find(
    (operation): operation is Extract<EditOperation, { type: 'crop' }> => operation.type === 'crop',
  )
}

/** The transform params in effect (identity when no transform op is present). */
export function transformParams(operations: EditOperation[]): TransformParams {
  const operation = operations.find(
    (candidateOperation): candidateOperation is Extract<EditOperation, { type: 'transform' }> =>
      candidateOperation.type === 'transform',
  )
  return operation ? operation.parameters : TRANSFORM_IDENTITY
}

/** Total rotation (90° steps + fine angle) in radians. */
function totalAngleRad(transformParameters: TransformParams): number {
  return ((transformParameters.rotate90 * 90 + transformParameters.fineAngle) * Math.PI) / 180
}

/** Axis-aligned bounding box of a rectangle rotated by the given transform. */
export function orientedBox(
  width: number,
  height: number,
  transformParameters: TransformParams,
): Size {
  const angleRadians = totalAngleRad(transformParameters)
  const absoluteCosine = Math.abs(Math.cos(angleRadians))
  const absoluteSine = Math.abs(Math.sin(angleRadians))
  return {
    width: Math.max(1, Math.round(width * absoluteCosine + height * absoluteSine)),
    height: Math.max(1, Math.round(width * absoluteSine + height * absoluteCosine)),
  }
}

/**
 * Size of the source AFTER orientation (mirror + rotate) — the axis-aligned
 * bounding box, so nothing clips. Crop coordinates live in this transformed
 * space, so cropping the (already transformed) preview is 1:1.
 */
export function transformedSize(source: ImageSource, operations: EditOperation[]): Size {
  const { width, height } = intrinsicSize(source)
  return orientedBox(width, height, transformParams(operations))
}

/**
 * Draw `source` oriented (mirror + rotate) into a fresh canvas sized to its
 * transformed bounding box, scaled by `scale`. Corners outside the rotated image
 * stay transparent. Never mutates `source`.
 */
function renderOriented(
  source: ImageSource,
  transformParameters: TransformParams,
  scale: number,
): HTMLCanvasElement {
  const { width, height } = intrinsicSize(source)
  const orientedBounds = orientedBox(width, height, transformParameters)
  const displayWidth = Math.max(1, Math.round(orientedBounds.width * scale))
  const displayHeight = Math.max(1, Math.round(orientedBounds.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = displayWidth
  canvas.height = displayHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')

  context.imageSmoothingQuality = 'high'
  // Transform about the center: mirror first (image axes), then rotate.
  context.translate(displayWidth / 2, displayHeight / 2)
  context.rotate(totalAngleRad(transformParameters))
  context.scale(
    (transformParameters.mirrorHorizontal ? -1 : 1) * scale,
    (transformParameters.mirrorVertical ? -1 : 1) * scale,
  )
  context.drawImage(source, -width / 2, -height / 2, width, height)
  return canvas
}

// --- Crop remapping across transform changes --------------------------------
// A crop is stored in the transformed image's pixels. When the transform
// changes, the crop is remapped so it keeps covering the SAME content: its
// CENTER is mapped through original-image space (which correctly accounts for
// rotation — a horizontal flip reads as a vertical flip on screen once the image
// is turned 90°), and its size is preserved (swapped for 90° turns). This keeps
// dimensions stable even with a non-zero straighten angle.

type Rect = { x: number; y: number; width: number; height: number }

function clampRect(rectangle: Rect, bounds: Size): Rect {
  const width = Math.max(1, Math.min(Math.round(rectangle.width), bounds.width))
  const height = Math.max(1, Math.min(Math.round(rectangle.height), bounds.height))
  const xPosition = Math.min(Math.max(Math.round(rectangle.x), 0), bounds.width - width)
  const yPosition = Math.min(Math.max(Math.round(rectangle.y), 0), bounds.height - height)
  return { x: xPosition, y: yPosition, width, height }
}

/** Map a point from transformed space back to original-image space. */
function toOriginal(
  transformedX: number,
  transformedY: number,
  imageWidth: number,
  imageHeight: number,
  transformParameters: TransformParams,
): [number, number] {
  const orientedBounds = orientedBox(imageWidth, imageHeight, transformParameters)
  const centeredX = transformedX - orientedBounds.width / 2
  const centeredY = transformedY - orientedBounds.height / 2
  // Inverse of forward (see renderOriented): un-rotate, then un-mirror.
  const angleRadians = -totalAngleRad(transformParameters)
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)
  const originalOffsetX =
    (transformParameters.mirrorHorizontal ? -1 : 1) * (centeredX * cosine - centeredY * sine)
  const originalOffsetY =
    (transformParameters.mirrorVertical ? -1 : 1) * (centeredX * sine + centeredY * cosine)
  return [originalOffsetX + imageWidth / 2, originalOffsetY + imageHeight / 2]
}

/** Map a point from original-image space into transformed space. */
function toTransformed(
  originalX: number,
  originalY: number,
  imageWidth: number,
  imageHeight: number,
  transformParameters: TransformParams,
): [number, number] {
  const orientedBounds = orientedBox(imageWidth, imageHeight, transformParameters)
  // Forward (see renderOriented): mirror in image axes, then rotate.
  const mirroredX = (transformParameters.mirrorHorizontal ? -1 : 1) * (originalX - imageWidth / 2)
  const mirroredY = (transformParameters.mirrorVertical ? -1 : 1) * (originalY - imageHeight / 2)
  const angleRadians = totalAngleRad(transformParameters)
  const cosine = Math.cos(angleRadians)
  const sine = Math.sin(angleRadians)
  return [
    mirroredX * cosine - mirroredY * sine + orientedBounds.width / 2,
    mirroredX * sine + mirroredY * cosine + orientedBounds.height / 2,
  ]
}

/**
 * Remap a crop rect from `oldT` to `newT` space so it keeps covering the same
 * content, with dimensions preserved (swapped for odd 90° turns). `w`/`h` are the
 * ORIGINAL image dimensions.
 */
export function remapCrop(
  rectangle: Rect,
  imageWidth: number,
  imageHeight: number,
  previousTransform: TransformParams,
  nextTransform: TransformParams,
): Rect {
  // Map the crop centre through original-image space.
  const [originalX, originalY] = toOriginal(
    rectangle.x + rectangle.width / 2,
    rectangle.y + rectangle.height / 2,
    imageWidth,
    imageHeight,
    previousTransform,
  )
  const [transformedCenterX, transformedCenterY] = toTransformed(
    originalX,
    originalY,
    imageWidth,
    imageHeight,
    nextTransform,
  )

  // Odd 90° rotation swaps width/height; flips/180° keep them.
  const quarterTurnDifference =
    (((nextTransform.rotate90 - previousTransform.rotate90) % 4) + 4) % 4
  const shouldSwapDimensions = quarterTurnDifference === 1 || quarterTurnDifference === 3
  const width = shouldSwapDimensions ? rectangle.height : rectangle.width
  const height = shouldSwapDimensions ? rectangle.width : rectangle.height

  return clampRect(
    {
      x: transformedCenterX - width / 2,
      y: transformedCenterY - height / 2,
      width,
      height,
    },
    orientedBox(imageWidth, imageHeight, nextTransform),
  )
}

// --- Normalized units -> canvas filter string (THE single mapping) -----------

/** Map -100..100 to a 0..2 multiplier; 0 => 1 (identity). */
function toMultiplier(normalized: number): number {
  return 1 + normalized / 100
}

function adjustFilters(parameters: AdjustParams): string[] {
  return [
    `brightness(${toMultiplier(parameters.brightness)})`,
    `contrast(${toMultiplier(parameters.contrast)})`,
    `saturate(${toMultiplier(parameters.saturation)})`,
  ]
}

function filterFn(operation: FilterOp): string {
  switch (operation.parameters.name) {
    case 'grayscale':
      return `grayscale(${operation.parameters.amount})`
    case 'sepia':
      return `sepia(${operation.parameters.amount})`
    default:
      return assertNever(operation.parameters.name)
  }
}

// --- Manual pixel fallback (browsers without CanvasRenderingContext2D.filter) -
// iOS forces every browser onto WebKit, where ctx.filter is unsupported/unreliable
// on older versions: assigning it is silently ignored, so color ops just vanish
// while geometry (transform/crop) still works. When we detect no native support we
// replicate the SAME filter chain by hand on the pixel buffer, so preview===export
// holds on both paths. Formulas mirror the CSS/SVG filter primitives exactly.

/** One color-only transform on non-premultiplied 0..255 channels. */
type PixelOp = (r: number, g: number, b: number) => [number, number, number]

function brightnessOp(multiplier: number): PixelOp {
  return (r, g, b) => [r * multiplier, g * multiplier, b * multiplier]
}

function contrastOp(amount: number): PixelOp {
  // CSS contrast() pivots around mid-gray (0.5 => 127.5 in 0..255).
  return (r, g, b) => [
    (r - 127.5) * amount + 127.5,
    (g - 127.5) * amount + 127.5,
    (b - 127.5) * amount + 127.5,
  ]
}

/** SVG feColorMatrix "saturate" (s=1 identity, s=0 fully gray). */
function saturateOp(s: number): PixelOp {
  return (r, g, b) => [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ]
}

/** SVG feColorMatrix "sepia" (a=0 identity, a=1 full sepia). */
function sepiaOp(amount: number): PixelOp {
  const inverse = 1 - amount
  return (r, g, b) => [
    (0.393 + 0.607 * inverse) * r + (0.769 - 0.769 * inverse) * g + (0.189 - 0.189 * inverse) * b,
    (0.349 - 0.349 * inverse) * r + (0.686 + 0.314 * inverse) * g + (0.168 - 0.168 * inverse) * b,
    (0.272 - 0.272 * inverse) * r + (0.534 - 0.534 * inverse) * g + (0.131 + 0.869 * inverse) * b,
  ]
}

/**
 * Ordered pixel ops equivalent to buildFilterString's chain. Kept in lockstep
 * with the switch in buildFilterString so both render paths stay identical.
 * grayscale(a) is exactly saturate(1 - a) per the CSS spec.
 */
function buildPixelOps(operations: EditOperation[]): PixelOp[] {
  const pixelOps: PixelOp[] = []

  for (const operation of operations) {
    switch (operation.type) {
      case 'transform':
      case 'crop':
        break
      case 'adjust':
        pixelOps.push(brightnessOp(toMultiplier(operation.parameters.brightness)))
        pixelOps.push(contrastOp(toMultiplier(operation.parameters.contrast)))
        pixelOps.push(saturateOp(toMultiplier(operation.parameters.saturation)))
        break
      case 'filter':
        switch (operation.parameters.name) {
          case 'grayscale':
            pixelOps.push(saturateOp(1 - operation.parameters.amount))
            break
          case 'sepia':
            pixelOps.push(sepiaOp(operation.parameters.amount))
            break
          default:
            assertNever(operation.parameters.name)
        }
        break
      default:
        assertNever(operation)
    }
  }

  return pixelOps
}

function toByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value
}

/** Apply the pixel-op chain in place over the whole canvas. No-op if empty. */
function applyPixelOps(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelOps: PixelOp[],
): void {
  if (pixelOps.length === 0) return
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] ?? 0
    let g = data[i + 1] ?? 0
    let b = data[i + 2] ?? 0
    for (const op of pixelOps) {
      ;[r, g, b] = op(r, g, b)
    }
    data[i] = toByte(r)
    data[i + 1] = toByte(g)
    data[i + 2] = toByte(b)
  }
  context.putImageData(imageData, 0, 0)
}

/**
 * Whether CanvasRenderingContext2D.filter actually takes effect (cached).
 *
 * We CANNOT trust the property round-trip: WebKit/iOS lets you assign and read
 * back `ctx.filter` (so `filter === 'blur(1px)'` is true) while completely
 * ignoring it when drawing. So we run a real functional test — paint white
 * through brightness(0) and check the pixel actually turned black.
 */
let contextFilterSupported: boolean | null = null
function supportsContextFilter(): boolean {
  if (contextFilterSupported !== null) return contextFilterSupported
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    contextFilterSupported = false
    return contextFilterSupported
  }
  context.filter = 'brightness(0)'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 1, 1)
  context.filter = 'none'
  // If the filter was applied, white -> black (r ~ 0); if ignored, r stays ~255.
  const red = context.getImageData(0, 0, 1, 1).data[0] ?? 255
  contextFilterSupported = red < 10
  return contextFilterSupported
}

/**
 * Compose the CSS filter string for a set of ops. Exhaustive over the op union:
 * adding a new EditOperation variant without handling it fails the build.
 */
export function buildFilterString(operations: EditOperation[]): string {
  const filterParts: string[] = []

  for (const operation of operations) {
    switch (operation.type) {
      case 'transform':
      case 'crop':
        // Geometry, not a pixel filter — handled by orientation / source rect.
        break
      case 'adjust':
        filterParts.push(...adjustFilters(operation.parameters))
        break
      case 'filter':
        filterParts.push(filterFn(operation))
        break
      default:
        assertNever(operation)
    }
  }

  return filterParts.length > 0 ? filterParts.join(' ') : 'none'
}

// --- Render ------------------------------------------------------------------

/** The full-resolution output size after applying transform then (optional) crop. */
export function outputSize(source: ImageSource, operations: EditOperation[]): Size {
  const crop = findCrop(operations)
  if (crop) {
    return {
      width: Math.round(crop.parameters.width),
      height: Math.round(crop.parameters.height),
    }
  }
  return transformedSize(source, operations)
}

/**
 * Render `source` through `ops` into `canvas`, scaled by `scale`.
 * `scale = 1` is full resolution (export); smaller values are for preview.
 * Pipeline order: transform → crop → adjust/filter. Crop is defined in the
 * transformed image's pixels (so cropping the previewed image is 1:1); the store
 * remaps the crop when the transform changes so it tracks the same content.
 * Returns the same canvas. Never mutates `source`.
 */
export function render(
  source: ImageSource,
  operations: EditOperation[],
  scale: number,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')

  // 1. Orient the whole image (mirror + rotate) into a scaled intermediate.
  const orientedCanvas = renderOriented(source, transformParams(operations), scale)

  // 2. Crop is in transformed (full-res) pixels; scale into the oriented canvas.
  const crop = findCrop(operations)
  const transformedBounds = transformedSize(source, operations)
  const cropX = crop ? clamp(crop.parameters.x, 0, transformedBounds.width) : 0
  const cropY = crop ? clamp(crop.parameters.y, 0, transformedBounds.height) : 0
  const cropWidth = crop
    ? clamp(crop.parameters.width, 1, transformedBounds.width - cropX)
    : transformedBounds.width
  const cropHeight = crop
    ? clamp(crop.parameters.height, 1, transformedBounds.height - cropY)
    : transformedBounds.height

  const sourceX = clamp(Math.round(cropX * scale), 0, orientedCanvas.width)
  const sourceY = clamp(Math.round(cropY * scale), 0, orientedCanvas.height)
  const sourceWidth = Math.max(
    1,
    Math.min(Math.round(cropWidth * scale), orientedCanvas.width - sourceX),
  )
  const sourceHeight = Math.max(
    1,
    Math.min(Math.round(cropHeight * scale), orientedCanvas.height - sourceY),
  )

  // 3. Draw the cropped region with the composed color filter.
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  context.clearRect(0, 0, sourceWidth, sourceHeight)
  const useNativeFilter = supportsContextFilter()
  context.filter = useNativeFilter ? buildFilterString(operations) : 'none'
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    orientedCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  )
  context.filter = 'none'

  // Fallback for engines (e.g. WebKit/iOS) that ignore context.filter: apply the
  // same color chain manually so filters/adjustments are not silently dropped.
  if (!useNativeFilter) {
    applyPixelOps(context, sourceWidth, sourceHeight, buildPixelOps(operations))
  }

  return canvas
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
