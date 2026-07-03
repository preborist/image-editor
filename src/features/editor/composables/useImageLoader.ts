import type { SourceInfo } from '../types'
import type { ImageSource } from './renderPipeline'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAXIMUM_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

export interface LoadedImage {
  source: ImageSource
  sourceInformation: SourceInfo
}

export class ImageLoadError extends Error {}

function validate(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    throw new ImageLoadError(
      `Unsupported file type "${file.type || 'unknown'}". Use PNG, JPEG, or WebP.`,
    )
  }
  if (file.size > MAXIMUM_FILE_BYTES) {
    const maximumMegabytes = (MAXIMUM_FILE_BYTES / (1024 * 1024)).toFixed(0)
    throw new ImageLoadError(`File is too large. Maximum size is ${maximumMegabytes} MB.`)
  }
}

/** Decode a File into an immutable ImageBitmap (fallback: HTMLImageElement). */
async function decode(file: File): Promise<ImageSource> {
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
