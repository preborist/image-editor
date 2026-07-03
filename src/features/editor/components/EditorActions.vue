<script setup lang="ts">
import { ref } from 'vue'

import { type ExportFormat, useExport } from '../composables/useExport'
import { useEditorStore } from '../store/editor'

const emit = defineEmits<{ crop: [] }>()

const store = useEditorStore()
const { exportImage, exportOperations } = useExport()

const format = ref<ExportFormat>('png')
const formats: ExportFormat[] = ['png', 'jpeg']
const exporting = ref(false)

async function onExportImage() {
  if (!store.original || !store.sourceInformation) return
  exporting.value = true
  try {
    await exportImage(store.original, store.operations, store.sourceInformation.name, format.value)
  } finally {
    exporting.value = false
  }
}

function onExportJson() {
  exportOperations(store.toDocument())
}
</script>

<template>
  <section
    class="actions"
    aria-label="Actions"
  >
    <v-btn
      block
      variant="tonal"
      prepend-icon="mdi-crop"
      @click="emit('crop')"
    >
      Crop
    </v-btn>

    <v-btn
      block
      variant="text"
      prepend-icon="mdi-restore"
      :disabled="store.operations.length === 0"
      @click="store.resetOps()"
    >
      Reset all edits
    </v-btn>

    <v-divider class="actions__divider" />

    <div class="actions__format">
      <v-select
        v-model="format"
        :items="formats"
        label="Format"
        density="compact"
        hide-details
        variant="outlined"
      />
    </div>

    <v-btn
      block
      color="primary"
      prepend-icon="mdi-download"
      :loading="exporting"
      @click="onExportImage"
    >
      Export image
    </v-btn>

    <v-btn
      block
      variant="tonal"
      prepend-icon="mdi-code-json"
      @click="onExportJson"
    >
      Export operations JSON
    </v-btn>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.actions {
  @include mx.flex-column(v.$space-xs);

  &__divider {
    margin: v.$space-xs 0;
  }

  &__format {
    margin-bottom: v.$space-3xs;
  }
}
</style>
