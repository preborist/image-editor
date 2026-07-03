<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Size } from '../composables/renderPipeline'
import { useRenderPipeline } from '../composables/useRenderPipeline'
import { useEditorStore } from '../store/editor'

const store = useEditorStore()
const { original, operations } = storeToRefs(store)
const { requestFrame, renderPreview } = useRenderPipeline()

const container = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const comparing = ref(false)

let resizeObserver: ResizeObserver | null = null

function containerSize(): Size {
  const containerElement = container.value
  if (!containerElement) return { width: 0, height: 0 }
  return { width: containerElement.clientWidth, height: containerElement.clientHeight }
}

function draw() {
  const source = original.value
  const target = canvas.value
  if (!source || !target) return
  // While comparing, render the untouched original (no ops) — the op stack is
  // left completely unchanged.
  const activeOperations = comparing.value ? [] : operations.value
  renderPreview(source, activeOperations, containerSize(), target)
}

function scheduleDraw() {
  requestFrame(draw)
}

// Re-render on any input that affects the preview.
watch([original, operations, comparing], scheduleDraw, { deep: true })

onMounted(() => {
  resizeObserver = new ResizeObserver(scheduleDraw)
  if (container.value) resizeObserver.observe(container.value)
  scheduleDraw()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function startCompare() {
  if (store.operations.length > 0) comparing.value = true
}
function endCompare() {
  comparing.value = false
}
</script>

<template>
  <div class="canvas-stage">
    <div
      ref="container"
      class="canvas-stage__viewport"
      :class="{ 'canvas-stage__viewport--comparable': store.operations.length > 0 }"
      @pointerdown="startCompare"
      @pointerup="endCompare"
      @pointerleave="endCompare"
      @pointercancel="endCompare"
      @contextmenu.prevent
    >
      <canvas
        ref="canvas"
        class="canvas-stage__canvas"
      />
      <span
        v-if="comparing"
        class="canvas-stage__badge"
        >Original</span
      >
    </div>

    <div class="canvas-stage__bar">
      <v-btn
        variant="tonal"
        prepend-icon="mdi-compare"
        :disabled="store.operations.length === 0"
        aria-label="Press and hold to compare with the original"
        @pointerdown="startCompare"
        @pointerup="endCompare"
        @pointerleave="endCompare"
        @pointercancel="endCompare"
      >
        Hold to compare
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.canvas-stage {
  @include mx.flex-column(v.$space-sm);
  height: 100%;

  &__viewport {
    @include mx.flex-center;
    position: relative;
    flex: 1;
    min-height: 0;
    padding: v.$space-lg;
    background: repeating-conic-gradient(#1a1d23 0% 25%, #212530 0% 50%) 50% / 24px 24px;
    border-radius: v.$radius-md;
    overflow: hidden;

    // Press-and-hold on the image itself reveals the original. This is the only
    // way to compare on small screens, where the button below is hidden.
    &--comparable {
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none; // no iOS "save image" popup on long-press
      touch-action: none; // long-press compares instead of scrolling/selecting
    }
  }

  &__canvas {
    max-width: 100%;
    max-height: 100%;
    box-shadow: v.$shadow-lg;
    border-radius: v.$radius-sm;
  }

  &__badge {
    position: absolute;
    top: v.$space-sm;
    left: v.$space-sm;
    padding: v.$space-3xs v.$space-xs;
    font-size: v.$font-size-xs;
    font-weight: v.$font-weight-medium;
    color: v.$color-text-inverse;
    background: v.$color-warning;
    border-radius: v.$radius-pill;
  }

  &__bar {
    @include mx.flex-center;
    flex: 0 0 auto;
    // Small screens: the edit menu overlaps this bar, so drop it entirely and
    // rely on press-and-hold directly on the image (see &__viewport--comparable).
    display: none;

    @include mx.breakpoint-up('sm') {
      display: flex;
    }
  }
}
</style>
