<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

import { useAppTheme } from '../composables/useAppTheme'
import { provideCropSession } from '../composables/useCropSession'
import { useEditorShortcuts } from '../composables/useEditorShortcuts'
import { useEditorStore } from '../store/editor'
import AdjustmentControls from './AdjustmentControls.vue'
import CropControls from './CropControls.vue'
import CropOverlay from './CropOverlay.vue'
import EditorActions from './EditorActions.vue'
import EditorCanvas from './EditorCanvas.vue'
import FilterControls from './FilterControls.vue'
import TransformControls from './TransformControls.vue'
import UploadPanel from './UploadPanel.vue'

const store = useEditorStore()
const { smAndDown: isSmallScreen } = useDisplay()
const theme = useAppTheme()

const cropping = ref(false)
const panelOpen = ref(false)

// Shared crop state for the on-canvas overlay and the sidebar crop controls.
const cropSession = provideCropSession()

theme.init()
useEditorShortcuts()

function applyCrop() {
  cropSession.commit()
  cropping.value = false
}

function newImage() {
  cropping.value = false
  store.clear()
}

// On small screens, opening crop should reveal the controls sheet.
watch(cropping, (isActive) => {
  if (isActive && isSmallScreen.value) panelOpen.value = true
})
</script>

<template>
  <div
    class="editor"
    :class="{ 'editor--mobile': isSmallScreen }"
  >
    <header class="editor__bar">
      <div class="editor__brand">
        <v-icon
          icon="mdi-image-edit-outline"
          color="primary"
        />
        <span class="editor__name">PrintEdit</span>
      </div>

      <p
        v-if="store.sourceInformation && !isSmallScreen"
        class="editor__file"
      >
        {{ store.sourceInformation.name }} · {{ store.sourceInformation.width }}×{{
          store.sourceInformation.height
        }}
      </p>

      <div class="editor__actions-bar">
        <template v-if="store.hasImage">
          <v-btn
            icon
            variant="text"
            size="small"
            aria-label="Undo"
            :disabled="!store.canUndo"
            @click="store.undo()"
          >
            <v-icon icon="mdi-undo" />
            <v-tooltip
              activator="parent"
              location="bottom"
              >Undo (Ctrl+Z)</v-tooltip
            >
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            aria-label="Redo"
            :disabled="!store.canRedo"
            @click="store.redo()"
          >
            <v-icon icon="mdi-redo" />
            <v-tooltip
              activator="parent"
              location="bottom"
              >Redo (Ctrl+Shift+Z)</v-tooltip
            >
          </v-btn>
        </template>

        <v-btn
          icon
          variant="text"
          size="small"
          aria-label="Toggle theme"
          @click="theme.toggle()"
        >
          <v-icon :icon="theme.isDark.value ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
          <v-tooltip
            activator="parent"
            location="bottom"
          >
            {{ theme.isDark.value ? 'Switch to light theme' : 'Switch to dark theme' }}
          </v-tooltip>
        </v-btn>

        <v-btn
          v-if="store.hasImage"
          size="small"
          variant="text"
          prepend-icon="mdi-image-plus-outline"
          @click="newImage"
        >
          New image
        </v-btn>
      </div>
    </header>

    <UploadPanel
      v-if="!store.hasImage"
      class="editor__upload"
    />

    <div
      v-else
      class="editor__workspace"
    >
      <main class="editor__stage">
        <CropOverlay
          v-if="cropping"
          @apply="applyCrop"
          @cancel="cropping = false"
        />
        <EditorCanvas v-else />
      </main>

      <aside
        class="editor__sidebar"
        :class="{ 'editor__sidebar--open': panelOpen }"
      >
        <button
          v-if="isSmallScreen"
          type="button"
          class="editor__sheet-handle"
          :aria-expanded="panelOpen"
          @click="panelOpen = !panelOpen"
        >
          <v-icon :icon="panelOpen ? 'mdi-chevron-down' : 'mdi-tune-variant'" />
          <span>{{ panelOpen ? 'Hide controls' : 'Edit' }}</span>
        </button>

        <div class="editor__sidebar-scroll">
          <CropControls
            v-if="cropping"
            @apply="applyCrop"
            @cancel="cropping = false"
          />
          <template v-else>
            <TransformControls />
            <v-divider />
            <AdjustmentControls />
            <v-divider />
            <FilterControls />
            <v-divider />
            <EditorActions @crop="cropping = true" />
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as v;
@use '@/styles/mixins' as mx;

.editor {
  @include mx.flex-column(0);
  height: 100vh;
  height: 100dvh;
  padding: v.$space-md;
  gap: v.$space-md;
  overflow-x: hidden;

  &__bar {
    @include mx.flex-between;
    flex: 0 0 auto;
    gap: v.$space-md;
    padding: 0 v.$space-xs;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: v.$space-xs;
  }

  &__name {
    font-size: v.$font-size-lg;
    font-weight: v.$font-weight-bold;
    letter-spacing: 0.01em;
  }

  &__file {
    @include mx.truncate;
    margin: 0;
    flex: 1;
    text-align: center;
    font-size: v.$font-size-sm;
    color: v.$color-text-muted;
  }

  &__actions-bar {
    display: flex;
    align-items: center;
    gap: v.$space-3xs;
    margin-left: auto;
  }

  &__upload {
    flex: 1;
    min-height: 0;
  }

  &__workspace {
    display: grid;
    grid-template-columns: 1fr;
    gap: v.$space-md;
    flex: 1;
    min-height: 0;

    @include mx.breakpoint-up('md') {
      grid-template-columns: 1fr 340px;
    }
  }

  &__stage {
    min-height: 0;
    min-width: 0;
  }

  &__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: v.$color-surface;
    border-radius: v.$radius-md;
  }

  &__sidebar-scroll {
    @include mx.flex-column(v.$space-md);
    padding: v.$space-md;
    overflow-y: auto;
  }

  &__sheet-handle {
    display: none;
  }

  // --- Mobile / small screens: controls become a bottom sheet ----------------
  &--mobile {
    .editor__workspace {
      display: block;
      position: relative;
    }

    .editor__stage {
      height: 100%;
    }

    .editor__sidebar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: v.$z-toolbar;
      max-height: 78dvh;
      border-radius: v.$radius-lg v.$radius-lg 0 0;
      box-shadow: v.$shadow-lg;
      transform: translateY(calc(100% - 52px));
      transition: transform 200ms ease;
    }

    .editor__sidebar--open {
      transform: translateY(0);
    }

    .editor__sheet-handle {
      @include mx.flex-center;
      @include mx.focus-visible;
      gap: v.$space-xs;
      flex: 0 0 auto;
      height: 52px;
      width: 100%;
      border: none;
      background: transparent;
      color: v.$color-text;
      font: inherit;
      font-weight: v.$font-weight-medium;
      cursor: pointer;
    }

    .editor__sidebar-scroll {
      max-height: calc(78dvh - 52px);
    }
  }
}
</style>
