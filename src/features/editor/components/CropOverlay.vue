<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { render } from '../composables/renderPipeline'
import { useCropSession } from '../composables/useCropSession'
import { useEditorStore } from '../store/editor'
import type { EditOperation } from '../types'

const store = useEditorStore()
const { operations } = storeToRefs(store)
const session = useCropSession()
const cropRectangle = session.cropRectangle

const cropArea = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

// Displayed size of the image inside the crop area (CSS px).
const displayDimensions = ref({ width: 0, height: 0 })

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]

const MINIMUM_PIXELS = 24
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

// Crop is selected on the transformed (previewed) image, so the crop base shows
// everything except the crop itself — i.e. the oriented, adjusted image.
const baseOperations = computed<EditOperation[]>(() =>
  operations.value.filter((operation) => operation.type !== 'crop'),
)

function originalSize() {
  return { width: session.sourceWidth.value, height: session.sourceHeight.value }
}

function drawBase() {
  const cropAreaElement = cropArea.value
  const canvasElement = canvas.value
  const source = store.original
  const originalDimensions = originalSize()
  if (!cropAreaElement || !canvasElement || !source || originalDimensions.width === 0) return

  const availableWidth = cropAreaElement.clientWidth - 32
  const availableHeight = cropAreaElement.clientHeight - 32
  const scale = Math.min(
    1,
    availableWidth / originalDimensions.width,
    availableHeight / originalDimensions.height,
  )
  displayDimensions.value = {
    width: Math.max(1, Math.round(originalDimensions.width * scale)),
    height: Math.max(1, Math.round(originalDimensions.height * scale)),
  }

  render(source, baseOperations.value, scale, canvasElement)
  canvasElement.style.width = `${displayDimensions.value.width}px`
  canvasElement.style.height = `${displayDimensions.value.height}px`
}

// --- Pointer drag (move + resize) -------------------------------------------

let dragState: {
  mode: 'move' | Handle
  startX: number
  startY: number
  rectangleSnapshot: typeof cropRectangle
} | null = null

function writeRectFromEdges(left: number, top: number, right: number, bottom: number) {
  const displayedSize = displayDimensions.value
  cropRectangle.x = left / displayedSize.width
  cropRectangle.y = top / displayedSize.height
  cropRectangle.width = (right - left) / displayedSize.width
  cropRectangle.height = (bottom - top) / displayedSize.height
}

function resizeTo(mode: Handle, horizontalPixelDelta: number, verticalPixelDelta: number) {
  const rectangleSnapshot = dragState!.rectangleSnapshot
  const displayedSize = displayDimensions.value
  const hasWest = mode.includes('w')
  const hasEast = mode.includes('e')
  const hasNorth = mode.includes('n')
  const hasSouth = mode.includes('s')

  let left = rectangleSnapshot.x * displayedSize.width
  let right = (rectangleSnapshot.x + rectangleSnapshot.width) * displayedSize.width
  let top = rectangleSnapshot.y * displayedSize.height
  let bottom = (rectangleSnapshot.y + rectangleSnapshot.height) * displayedSize.height

  if (hasWest) left = rectangleSnapshot.x * displayedSize.width + horizontalPixelDelta
  if (hasEast) {
    right =
      (rectangleSnapshot.x + rectangleSnapshot.width) * displayedSize.width + horizontalPixelDelta
  }
  if (hasNorth) top = rectangleSnapshot.y * displayedSize.height + verticalPixelDelta
  if (hasSouth) {
    bottom =
      (rectangleSnapshot.y + rectangleSnapshot.height) * displayedSize.height + verticalPixelDelta
  }

  const ratio = session.ratio.value
  if (ratio) {
    const centerX = (rectangleSnapshot.x + rectangleSnapshot.width / 2) * displayedSize.width
    const centerY = (rectangleSnapshot.y + rectangleSnapshot.height / 2) * displayedSize.height
    const isCornerHandle = (hasWest || hasEast) && (hasNorth || hasSouth)
    const isWidthPrimary = isCornerHandle
      ? Math.abs(horizontalPixelDelta) >= Math.abs(verticalPixelDelta)
      : hasWest || hasEast

    let width = isWidthPrimary ? right - left : (bottom - top) * ratio
    const maximumWidth = hasEast
      ? displayedSize.width - left
      : hasWest
        ? right
        : 2 * Math.min(centerX, displayedSize.width - centerX)
    const maximumHeight = hasSouth
      ? displayedSize.height - top
      : hasNorth
        ? bottom
        : 2 * Math.min(centerY, displayedSize.height - centerY)
    width = Math.min(width, maximumWidth, maximumHeight * ratio)
    width = Math.max(width, MINIMUM_PIXELS, MINIMUM_PIXELS * ratio)
    const height = width / ratio

    if (hasEast) right = left + width
    else if (hasWest) left = right - width
    else {
      left = centerX - width / 2
      right = centerX + width / 2
    }
    if (hasSouth) bottom = top + height
    else if (hasNorth) top = bottom - height
    else {
      top = centerY - height / 2
      bottom = centerY + height / 2
    }
  } else {
    left = clamp(left, 0, right - MINIMUM_PIXELS)
    right = clamp(right, left + MINIMUM_PIXELS, displayedSize.width)
    top = clamp(top, 0, bottom - MINIMUM_PIXELS)
    bottom = clamp(bottom, top + MINIMUM_PIXELS, displayedSize.height)
  }

  writeRectFromEdges(left, top, right, bottom)
}

function moveTo(horizontalPixelDelta: number, verticalPixelDelta: number) {
  const rectangleSnapshot = dragState!.rectangleSnapshot
  const displayedSize = displayDimensions.value
  cropRectangle.x = clamp(
    rectangleSnapshot.x + horizontalPixelDelta / displayedSize.width,
    0,
    1 - rectangleSnapshot.width,
  )
  cropRectangle.y = clamp(
    rectangleSnapshot.y + verticalPixelDelta / displayedSize.height,
    0,
    1 - rectangleSnapshot.height,
  )
}

function onPointerMove(event: PointerEvent) {
  if (!dragState) return
  const horizontalDelta = event.clientX - dragState.startX
  const verticalDelta = event.clientY - dragState.startY
  if (dragState.mode === 'move') moveTo(horizontalDelta, verticalDelta)
  else resizeTo(dragState.mode, horizontalDelta, verticalDelta)
}

function endDrag() {
  dragState = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
}

function startDrag(mode: 'move' | Handle, event: PointerEvent) {
  dragState = {
    mode,
    startX: event.clientX,
    startY: event.clientY,
    rectangleSnapshot: { ...cropRectangle },
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
}

// --- Lifecycle --------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  session.seedFromStore()
  drawBase()
  resizeObserver = new ResizeObserver(drawBase)
  if (cropArea.value) resizeObserver.observe(cropArea.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  endDrag()
})

watch(baseOperations, drawBase, { deep: true })

const boxStyle = computed(() => ({
  left: `${cropRectangle.x * displayDimensions.value.width}px`,
  top: `${cropRectangle.y * displayDimensions.value.height}px`,
  width: `${cropRectangle.width * displayDimensions.value.width}px`,
  height: `${cropRectangle.height * displayDimensions.value.height}px`,
}))
</script>

<template>
  <div class="cropper">
    <div
      ref="cropArea"
      class="cropper__area"
    >
      <div
        class="cropper__stage"
        :style="{
          width: `${displayDimensions.width}px`,
          height: `${displayDimensions.height}px`,
        }"
      >
        <canvas
          ref="canvas"
          class="cropper__base"
        />

        <div
          class="cropper__box"
          :style="boxStyle"
          @pointerdown.self.prevent="startDrag('move', $event)"
        >
          <span
            class="cropper__grid"
            aria-hidden="true"
          />
          <span class="cropper__size"
            >{{ session.widthPixels.value }} × {{ session.heightPixels.value }} px</span
          >
          <span
            v-for="handle in HANDLES"
            :key="handle"
            class="cropper__handle"
            :class="`cropper__handle--${handle}`"
            @pointerdown.stop.prevent="startDrag(handle, $event)"
          />
        </div>
      </div>
    </div>

    <p class="cropper__hint">
      Drag a <strong>corner or edge</strong> to resize, drag <strong>inside</strong> to move — or
      set exact dimensions in the panel.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

$handle-size: 14px;

.cropper {
  @include mx.flex-column(v.$space-sm);
  height: 100%;

  &__area {
    @include mx.flex-center;
    position: relative;
    flex: 1;
    min-height: 0;
    padding: v.$space-md;
    background: repeating-conic-gradient(#1a1d23 0% 25%, #212530 0% 50%) 50% / 24px 24px;
    border-radius: v.$radius-md;
    overflow: hidden;
  }

  &__stage {
    position: relative;
    box-shadow: v.$shadow-lg;
  }

  &__base {
    display: block;
    border-radius: v.$radius-sm;
  }

  &__box {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(#fff, 0.9);
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.55);
    cursor: move;
    touch-action: none;
  }

  &__grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(#fff, 0.35) 1px, transparent 1px),
      linear-gradient(rgba(#fff, 0.35) 1px, transparent 1px),
      linear-gradient(90deg, rgba(#fff, 0.35) 1px, transparent 1px),
      linear-gradient(90deg, rgba(#fff, 0.35) 1px, transparent 1px);
    background-position:
      0 33.33%,
      0 66.66%,
      33.33% 0,
      66.66% 0;
    background-size:
      100% 1px,
      100% 1px,
      1px 100%,
      1px 100%;
    background-repeat: no-repeat;
  }

  &__size {
    position: absolute;
    top: v.$space-2xs;
    left: v.$space-2xs;
    padding: 2px 6px;
    font-size: v.$font-size-xs;
    font-family: v.$font-family-mono;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    border-radius: v.$radius-sm;
    pointer-events: none;
  }

  &__handle {
    position: absolute;
    width: $handle-size;
    height: $handle-size;
    background: v.$color-primary;
    border: 2px solid #fff;
    border-radius: 2px;
    touch-action: none;

    &--nw {
      top: 0;
      left: 0;
      transform: translate(-50%, -50%);
      cursor: nwse-resize;
    }
    &--ne {
      top: 0;
      right: 0;
      transform: translate(50%, -50%);
      cursor: nesw-resize;
    }
    &--se {
      bottom: 0;
      right: 0;
      transform: translate(50%, 50%);
      cursor: nwse-resize;
    }
    &--sw {
      bottom: 0;
      left: 0;
      transform: translate(-50%, 50%);
      cursor: nesw-resize;
    }
    &--n {
      top: 0;
      left: 50%;
      transform: translate(-50%, -50%);
      cursor: ns-resize;
    }
    &--s {
      bottom: 0;
      left: 50%;
      transform: translate(-50%, 50%);
      cursor: ns-resize;
    }
    &--e {
      top: 50%;
      right: 0;
      transform: translate(50%, -50%);
      cursor: ew-resize;
    }
    &--w {
      top: 50%;
      left: 0;
      transform: translate(-50%, -50%);
      cursor: ew-resize;
    }
  }

  &__hint {
    flex: 0 0 auto;
    margin: 0;
    font-size: v.$font-size-sm;
    color: v.$color-text-muted;
  }
}
</style>
