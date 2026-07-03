import type { SourceInfo } from '../types'
import { type ImageSource,intrinsicSize } from './renderPipeline'

export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

// iOS frequently hands HEIC files over with an empty or non-standard MIME type,
// so we accept by extension as well. These also go into the picker's `accept`.
export const ACCEPTED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.heif',
] as const

export const MAXIMUM_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

export interface LoadedImage {
  source: ImageSource
  sourceInformation: SourceInfo
}

export class ImageLoadError extends Error {}

function hasAcceptedExtension(name: string): boolean {
  const lowerName = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function validate(file: File): void {
  const typeAccepted = ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])
  // Fall back to the extension when the browser reports no/odd MIME type (iOS HEIC).
  if (!typeAccepted && !hasAcceptedExtension(file.name)) {
    throw new ImageLoadError(
      `Unsupported file type "${file.type || 'unknown'}". Use PNG, JPEG, WebP, or HEIC.`,
    )
  }
  if (file.size > MAXIMUM_FILE_BYTES) {
    const maximumMegabytes = (MAXIMUM_FILE_BYTES / (1024 * 1024)).toFixed(0)
    throw new ImageLoadError(`File is too large. Maximum size is ${maximumMegabytes} MB.`)
  }
}

/** Decode a File into a raw bitmap/image (fallback: HTMLImageElement). */
async function decodeRaw(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new ImageLoadError('Failed to decode image.'))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Flatten any decoded source into a fresh sRGB canvas.
 *
 * iPhone photos (HEIC and often JPEG too) carry a wide-gamut Display-P3 profile.
 * WebKit silently ignores `ctx.filter` when drawImage's source is a P3 bitmap,
 * so filters/adjustments do nothing on those photos while geometry still works.
 * Drawing the source once into an explicit sRGB canvas converts the pixels to
 * sRGB and gives every later render a color space WebKit filters reliably.
 */
function toSrgbCanvas(source: ImageSource): HTMLCanvasElement {
  const { width, height } = intrinsicSize(source)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { colorSpace: 'srgb' })
  if (!context) throw new ImageLoadError('2D canvas context unavailable.')
  context.drawImage(source, 0, 0)
  return canvas
}

/** Decode a File into an immutable, sRGB-normalized canvas source. */
async function decode(file: File): Promise<ImageSource> {
  const raw = await decodeRaw(file)
  const canvas = toSrgbCanvas(raw)
  // The intermediate bitmap is fully copied into the canvas; release it.
  if (typeof ImageBitmap !== 'undefined' && raw instanceof ImageBitmap) raw.close()
  return canvas
}

/**
 * Validate and decode a local image file. Throws ImageLoadError on invalid
 * input. The returned source is treated as immutable by the rest of the app.
 */
export function useImageLoader() {
  async function loadFile(file: File): Promise<LoadedImage> {
    validate(file)
    const source = await decode(file)
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    return { source, sourceInformation: { name: file.name, width, height } }
  }

  return { loadFile }
}
