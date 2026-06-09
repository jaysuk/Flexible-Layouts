<template>
	<!-- DWC's file explorer rooted at the configured directory. -->
	<div class="ex-root fill-height" :class="{ 'ex-frozen': disabledNow }">
		<component :is="fileList" :options="browserOptions" :root-directory="rootDir" :root-label="rootDir"
				   :no-items-text="$t('plugins.flexibleLayouts.files.none')" />
	</div>
</template>

<script setup lang="ts">
import { computed, resolveComponent } from "vue";

import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "explorer" }>; disabled?: boolean }>();
const fileList = resolveComponent("FileList");
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const rootDir = computed(() => props.widget.folder || "0:/");
const browserOptions = computed(() => ({ initialDirectory: rootDir.value, initialFiles: [] as Array<unknown> }));
</script>

<style scoped>
.ex-root { min-height: 0; overflow: auto; }
.ex-frozen { opacity: 0.5; pointer-events: none; }
</style>
