import type { EditOperation, OpsDocument } from '../types'
import { type ImageSource, render } from './renderPipeline'

export type ExportFormat = 'png' | 'jpeg'

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const downloadAnchor = document.createElement('a')
  downloadAnchor.href = objectUrl
  downloadAnchor.download = filename
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
  URL.revokeObjectURL(objectUrl)
}

/** Strip any extension from a source filename for building export names. */
function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || 'image'
}

/** Composite a (possibly transparent) canvas over a solid background color. */
function withMatte(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = source.width
  outputCanvas.height = source.height
  const context = outputCanvas.getContext('2d')
  if (!context) return source
  context.fillStyle = color
  context.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
  context.drawImage(source, 0, 0)
  return outputCanvas
}

export function useExport() {
  /**
   * Render the operations against the FULL-RESOLUTION original (scale = 1) and
   * download the result. Uses the same pipeline as the preview, so the export
   * matches what the user sees — only the resolution differs.
   */
  async function exportImage(
    source: ImageSource,
    operations: EditOperation[],
    sourceName: string,
    format: ExportFormat = 'png',
    quality = 0.92,
  ): Promise<void> {
    const canvas = document.createElement('canvas')
    render(source, operations, 1, canvas)

    // JPEG has no alpha: composite over a white matte so rotated/transparent
    // corners export as white instead of black.
    const encodeCanvas = format === 'jpeg' ? withMatte(canvas, '#ffffff') : canvas

    const blob = await new Promise<Blob | null>((resolve) =>
      encodeCanvas.toBlob(resolve, MIME[format], quality),
    )
    if (!blob) throw new Error('Failed to encode exported image.')

    const extension = format === 'jpeg' ? 'jpg' : 'png'
    triggerDownload(blob, `${baseName(sourceName)}-edited.${extension}`)
  }

  /** Download the versioned operations document as JSON. */
  function exportOperations(document: OpsDocument): void {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    triggerDownload(blob, `${baseName(document.source.name)}-ops.json`)
  }

  return { exportImage, exportOperations }
}
