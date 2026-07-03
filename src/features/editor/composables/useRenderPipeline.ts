import { onScopeDispose } from 'vue'

import type { EditOperation } from '../types'
import { type ImageSource, outputSize, render, type Size } from './renderPipeline'

/**
 * Preview scheduling on top of the pure render pipeline.
 *
 * requestFrame coalesces bursts of slider input into at most one render per
 * animation frame. Because the callback reads live state when the frame fires,
 * the final settled value is always rendered (no dropped trailing frame).
 */
export function useRenderPipeline() {
  let animationFrameIdentifier: number | null = null

  function requestFrame(drawPreview: () => void) {
    if (animationFrameIdentifier !== null) return // queued frame will read the latest state
    animationFrameIdentifier = requestAnimationFrame(() => {
      animationFrameIdentifier = null
      drawPreview()
    })
  }

  /** Scale that fits the full-res output inside `container` (never upscales). */
  function fitScale(outputDimensions: Size, containerDimensions: Size): number {
    if (outputDimensions.width === 0 || outputDimensions.height === 0) return 1
    return Math.min(
      1,
      containerDimensions.width / outputDimensions.width,
      containerDimensions.height / outputDimensions.height,
    )
  }

  /** Render a fit-to-container preview into `canvas`. */
  function renderPreview(
    source: ImageSource,
    operations: EditOperation[],
    containerDimensions: Size,
    canvas: HTMLCanvasElement,
  ) {
    const outputDimensions = outputSize(source, operations)
    render(source, operations, fitScale(outputDimensions, containerDimensions), canvas)
  }

  onScopeDispose(() => {
    if (animationFrameIdentifier !== null) cancelAnimationFrame(animationFrameIdentifier)
  })

  return { requestFrame, fitScale, renderPreview }
}
