<script setup lang="ts">
import { useEditorStore } from '../store/editor'
import type { FilterName } from '../types'

const store = useEditorStore()

const filters: { name: FilterName; label: string }[] = [
  { name: 'grayscale', label: 'Grayscale' },
  { name: 'sepia', label: 'Sepia' },
]

function toggle(name: FilterName, value: boolean | null) {
  store.setFilter(name, value === true)
}
</script>

<template>
  <section
    class="filters"
    aria-label="Filters"
  >
    <h3 class="filters__title">Filters</h3>
    <div class="filters__list">
      <v-switch
        v-for="filter in filters"
        :key="filter.name"
        :label="filter.label"
        :model-value="store.activeFilters.has(filter.name)"
        color="primary"
        density="compact"
        hide-details
        inset
        @update:model-value="(value) => toggle(filter.name, value)"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.filters {
  @include mx.flex-column(v.$space-xs);

  &__title {
    margin: 0;
    font-size: v.$font-size-md;
    font-weight: v.$font-weight-medium;
  }

  &__list {
    @include mx.flex-column(v.$space-3xs);
  }
}
</style>
