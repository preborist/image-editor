<script setup lang="ts">
import { ref } from 'vue'

import { ACCEPTED_TYPES, ImageLoadError, useImageLoader } from '../composables/useImageLoader'
import { useEditorStore } from '../store/editor'

const store = useEditorStore()
const { loadFile } = useImageLoader()

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const error = ref<string | null>(null)
const accept = ACCEPTED_TYPES.join(',')

async function handleFile(file: File | undefined) {
  if (!file) return
  error.value = null
  try {
    const { source, sourceInformation } = await loadFile(file)
    store.setOriginal(source, sourceInformation)
  } catch (caughtError) {
    error.value =
      caughtError instanceof ImageLoadError ? caughtError.message : 'Could not load the image.'
  }
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  handleFile(input.files?.[0])
  input.value = '' // allow re-selecting the same file
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  handleFile(event.dataTransfer?.files?.[0])
}

function openPicker() {
  fileInput.value?.click()
}
</script>

<template>
  <div
    class="upload"
    :class="{ 'upload--dragging': isDragging }"
    role="button"
    tabindex="0"
    aria-label="Upload an image by clicking or dropping a file"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="onDrop"
  >
    <v-icon
      icon="mdi-cloud-upload-outline"
      size="64"
      class="upload__icon"
    />
    <h2 class="upload__title">Drop an image here</h2>
    <p class="upload__hint">or click to browse — PNG, JPEG or WebP, up to 25&nbsp;MB</p>

    <input
      ref="fileInput"
      class="upload__input"
      type="file"
      :accept="accept"
      @change="onInputChange"
    />

    <v-alert
      v-if="error"
      class="upload__error"
      closable
      icon="mdi-alert-circle-outline"
      type="error"
      density="compact"
      variant="tonal"
      @click.stop
    >
      {{ error }}
    </v-alert>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.upload {
  @include mx.flex-column(v.$space-sm);
  @include mx.focus-visible;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: v.$space-2xl;
  min-height: 60vh;
  border: 2px dashed v.$color-border;
  border-radius: v.$radius-lg;
  background: v.$color-surface;
  color: v.$color-text-muted;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;

  &:hover,
  &--dragging {
    border-color: v.$color-primary;
    background: v.$color-surface-alt;
  }

  &__icon {
    color: v.$color-primary;
  }

  &__title {
    margin: 0;
    font-size: v.$font-size-xl;
    font-weight: v.$font-weight-medium;
    color: v.$color-text;
  }

  &__hint {
    margin: 0;
    font-size: v.$font-size-sm;
  }

  &__input {
    display: none;
  }

  &__error {
    margin-top: v.$space-md;
    max-width: 32rem;
    text-align: left;
  }
}
</style>
