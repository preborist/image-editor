<script setup lang="ts">
import { computed } from 'vue'

import { useEditorStore } from '../store/editor'
import { ADJUST_IDENTITY, type AdjustParams } from '../types'

const store = useEditorStore()

// Each slider reads the current adjust op and writes back the whole (upserted)
// AdjustParams, so all three values live in one op.
function bind(key: keyof AdjustParams) {
  return computed<number>({
    get: () => store.adjustment[key],
    set: (value) => store.upsertAdjust({ ...store.adjustment, [key]: value }),
  })
}

const brightness = bind('brightness')
const contrast = bind('contrast')
const saturation = bind('saturation')

const isIdentity = computed(
  () =>
    store.adjustment.brightness === ADJUST_IDENTITY.brightness &&
    store.adjustment.contrast === ADJUST_IDENTITY.contrast &&
    store.adjustment.saturation === ADJUST_IDENTITY.saturation,
)

const sliders = [
  { label: 'Brightness', model: brightness },
  { label: 'Contrast', model: contrast },
  { label: 'Saturation', model: saturation },
]

function resetAdjust() {
  store.snapshot()
  store.upsertAdjust({ ...ADJUST_IDENTITY })
}
</script>

<template>
  <section
    class="adjust"
    aria-label="Adjustments"
  >
    <header class="adjust__header">
      <h3 class="adjust__title">Adjustments</h3>
      <v-btn
        size="small"
        variant="text"
        :disabled="isIdentity"
        @click="resetAdjust"
      >
        Reset
      </v-btn>
    </header>

    <div
      v-for="slider in sliders"
      :key="slider.label"
      class="adjust__row"
    >
      <div class="adjust__meta">
        <label class="adjust__label">{{ slider.label }}</label>
        <span class="adjust__value">{{ slider.model.value }}</span>
      </div>
      <v-slider
        v-model="slider.model.value"
        :min="-100"
        :max="100"
        :step="1"
        hide-details
        density="compact"
        color="primary"
        :aria-label="slider.label"
        @start="store.snapshot()"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.adjust {
  @include mx.flex-column(v.$space-sm);

  &__header {
    @include mx.flex-between;
  }

  &__title {
    margin: 0;
    font-size: v.$font-size-md;
    font-weight: v.$font-weight-medium;
  }

  &__row {
    @include mx.flex-column(v.$space-3xs);
  }

  &__meta {
    @include mx.flex-between;
  }

  &__label {
    font-size: v.$font-size-sm;
    color: v.$color-text-muted;
  }

  &__value {
    font-family: v.$font-family-mono;
    font-size: v.$font-size-xs;
    color: v.$color-text;
  }
}
</style>
