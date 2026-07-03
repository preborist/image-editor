<script setup lang="ts">
import { computed } from 'vue'

import { useEditorStore } from '../store/editor'

const store = useEditorStore()

const transform = computed(() => store.transform)

const fineAngle = computed<number>({
  get: () => store.transform.fineAngle,
  set: (degrees) => store.setFineAngle(Math.round(degrees)),
})

const isIdentity = computed(
  () =>
    transform.value.rotate90 === 0 &&
    transform.value.fineAngle === 0 &&
    !transform.value.mirrorHorizontal &&
    !transform.value.mirrorVertical,
)

function resetTransform() {
  store.snapshot()
  store.upsertTransform({
    rotate90: 0,
    fineAngle: 0,
    mirrorHorizontal: false,
    mirrorVertical: false,
  })
}
</script>

<template>
  <section
    class="transform"
    aria-label="Transform"
  >
    <header class="transform__header">
      <h3 class="transform__title">Transform</h3>
      <v-btn
        size="small"
        variant="text"
        :disabled="isIdentity"
        @click="resetTransform"
      >
        Reset
      </v-btn>
    </header>

    <div class="transform__row">
      <v-btn-group
        divided
        density="comfortable"
        class="transform__group"
      >
        <v-btn
          :active="transform.mirrorHorizontal"
          :color="transform.mirrorHorizontal ? 'primary' : undefined"
          prepend-icon="mdi-flip-horizontal"
          @click="store.mirror('h')"
        >
          Flip H
        </v-btn>
        <v-btn
          :active="transform.mirrorVertical"
          :color="transform.mirrorVertical ? 'primary' : undefined"
          prepend-icon="mdi-flip-vertical"
          @click="store.mirror('v')"
        >
          Flip V
        </v-btn>
      </v-btn-group>
    </div>

    <div class="transform__row">
      <v-btn-group
        divided
        density="comfortable"
        class="transform__group"
      >
        <v-btn
          icon
          aria-label="Rotate 90° counter-clockwise"
          @click="store.rotate90('ccw')"
        >
          <v-icon icon="mdi-rotate-left" />
          <v-tooltip
            activator="parent"
            location="bottom"
            >Rotate 90° counter-clockwise</v-tooltip
          >
        </v-btn>
        <v-btn
          icon
          aria-label="Rotate 90° clockwise"
          @click="store.rotate90('cw')"
        >
          <v-icon icon="mdi-rotate-right" />
          <v-tooltip
            activator="parent"
            location="bottom"
            >Rotate 90° clockwise</v-tooltip
          >
        </v-btn>
      </v-btn-group>
    </div>

    <div class="transform__fine">
      <div class="transform__meta">
        <label class="transform__label">Straighten</label>
        <span class="transform__value">{{ fineAngle }}°</span>
      </div>
      <div class="transform__fine-row">
        <v-slider
          v-model="fineAngle"
          :min="-45"
          :max="45"
          :step="1"
          hide-details
          density="compact"
          color="primary"
          aria-label="Straighten angle"
          @start="store.snapshot()"
        />
        <v-text-field
          v-model.number="fineAngle"
          type="number"
          :min="-45"
          :max="45"
          :step="1"
          density="compact"
          variant="outlined"
          hide-details
          class="transform__angle-input"
          @update:model-value="store.snapshot()"
        />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.transform {
  @include mx.flex-column(v.$space-sm);

  &__header {
    @include mx.flex-between;
  }

  &__title {
    margin: 0;
    font-size: v.$font-size-md;
    font-weight: v.$font-weight-medium;
  }

  &__group {
    width: 100%;

    .v-btn {
      flex: 1;
    }
  }

  &__fine {
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
  }

  &__fine-row {
    display: flex;
    align-items: center;
    gap: v.$space-sm;
  }

  &__angle-input {
    max-width: 84px;
  }
}
</style>
