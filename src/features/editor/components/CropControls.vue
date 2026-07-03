<script setup lang="ts">
import { computed } from 'vue'

import {
  CROP_DOTS_PER_INCH,
  CROP_PRESETS,
  type CropUnit,
  pxToUnit,
  unitToPx,
  useCropSession,
} from '../composables/useCropSession'

const emit = defineEmits<{ apply: []; cancel: [] }>()

const session = useCropSession()

const presetItems = CROP_PRESETS.map((preset) => ({ title: preset.title, value: preset.key }))
const unitItems: { title: string; value: CropUnit }[] = [
  { title: 'px', value: 'px' },
  { title: 'inches', value: 'in' },
  { title: 'cm', value: 'cm' },
  { title: 'mm', value: 'mm' },
]

function round(value: number): number {
  const decimals = session.measurementUnit.value === 'px' ? 0 : 2
  const roundingFactor = 10 ** decimals
  return Math.round(value * roundingFactor) / roundingFactor
}

const widthField = computed<number>({
  get: () => round(pxToUnit(session.widthPixels.value, session.measurementUnit.value)),
  set: (value) =>
    session.setSourceWidth(unitToPx(Number(value) || 0, session.measurementUnit.value)),
})

const heightField = computed<number>({
  get: () => round(pxToUnit(session.heightPixels.value, session.measurementUnit.value)),
  set: (value) =>
    session.setSourceHeight(unitToPx(Number(value) || 0, session.measurementUnit.value)),
})

const step = computed(() => (session.measurementUnit.value === 'px' ? 1 : 0.01))
const usesPhysicalUnits = computed(() => session.measurementUnit.value !== 'px')
</script>

<template>
  <section
    class="crop-controls"
    aria-label="Crop controls"
  >
    <h3 class="crop-controls__title">Crop</h3>

    <v-switch
      v-model="session.shouldConstrainProportions.value"
      label="Constrain proportions"
      color="primary"
      density="compact"
      hide-details
      inset
    />

    <template v-if="session.shouldConstrainProportions.value">
      <div class="crop-controls__ratio">
        <v-select
          v-model="session.presetKey.value"
          :items="presetItems"
          label="Ratio"
          density="compact"
          variant="outlined"
          hide-details
        />
        <v-btn
          icon
          variant="tonal"
          size="small"
          aria-label="Rotate ratio"
          @click="session.isRatioRotated.value = !session.isRatioRotated.value"
        >
          <v-icon icon="mdi-screen-rotation" />
          <v-tooltip
            activator="parent"
            location="bottom"
            >Rotate ratio (swap width and height)</v-tooltip
          >
        </v-btn>
      </div>
    </template>

    <div class="crop-controls__dims">
      <v-text-field
        v-model.number="widthField"
        type="number"
        label="Width"
        :step="step"
        min="0"
        density="compact"
        variant="outlined"
        hide-details
      />
      <span class="crop-controls__times">×</span>
      <v-text-field
        v-model.number="heightField"
        type="number"
        label="Height"
        :step="step"
        min="0"
        density="compact"
        variant="outlined"
        hide-details
      />
      <v-select
        v-model="session.measurementUnit.value"
        :items="unitItems"
        label="Unit"
        density="compact"
        variant="outlined"
        hide-details
        class="crop-controls__unit"
      />
    </div>

    <p
      v-if="usesPhysicalUnits"
      class="crop-controls__note"
    >
      Physical size at {{ CROP_DOTS_PER_INCH }} DPI · {{ session.widthPixels.value }}×{{
        session.heightPixels.value
      }}
      px
    </p>

    <div class="crop-controls__actions">
      <v-btn
        size="small"
        variant="text"
        @click="session.selectAll()"
        >Select all</v-btn
      >
      <v-spacer />
      <v-btn
        variant="tonal"
        @click="emit('cancel')"
        >Cancel</v-btn
      >
      <v-btn
        color="primary"
        prepend-icon="mdi-crop"
        @click="emit('apply')"
        >Apply</v-btn
      >
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.crop-controls {
  @include mx.flex-column(v.$space-sm);

  &__title {
    margin: 0;
    font-size: v.$font-size-md;
    font-weight: v.$font-weight-medium;
  }

  &__ratio {
    display: flex;
    align-items: center;
    gap: v.$space-xs;
  }

  &__dims {
    display: flex;
    align-items: center;
    gap: v.$space-xs;
  }

  &__times {
    color: v.$color-text-muted;
  }

  &__unit {
    min-width: 80px;
    max-width: 96px;
  }

  &__note {
    margin: 0;
    font-size: v.$font-size-xs;
    color: v.$color-text-muted;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: v.$space-xs;
    margin-top: v.$space-xs;
  }
}
</style>
