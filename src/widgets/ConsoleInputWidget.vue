<template>
	<div class="ci-root fill-height d-flex align-center" :class="{ 'ci-frozen': disabledNow }">
		<input v-model="cmd" class="ci-input" type="text" autocomplete="off" spellcheck="false"
			   :placeholder="widget.placeholder || $t('plugins.flexibleLayouts.console.placeholder')"
			   :disabled="disabledNow"
			   @keydown.enter="send" @keydown.up.prevent="recall(1)" @keydown.down.prevent="recall(-1)" />
		<button type="button" class="ci-send" :disabled="disabledNow || !cmd.trim()"
				:title="$t('plugins.flexibleLayouts.console.send')" @click="send">
			<v-icon size="small">mdi-send</v-icon>
		</button>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { useConsoleSend } from "../util/consoleLog";

const props = defineProps<{ widget: Extract<Widget, { type: "consoleInput" }>; disabled?: boolean }>();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const { cmd, recall, send } = useConsoleSend(() => disabledNow.value);
</script>

<style scoped>
.ci-root { min-height: 0; gap: 4px; padding: 4px; }
.ci-frozen { opacity: 0.5; pointer-events: none; }
.ci-input {
	flex: 1 1 auto; min-width: 0; box-sizing: border-box;
	font: inherit; font-size: 0.85em; line-height: 1.4;
	padding: 3px 6px; color: inherit;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.3); border-radius: 4px;
}
.ci-input:focus { outline: none; border-color: rgb(var(--v-theme-primary)); }
.ci-send {
	flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
	padding: 0 8px; border-radius: 4px; cursor: pointer; color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.12); border: 1px solid rgba(var(--v-theme-primary), 0.4);
}
.ci-send:disabled { opacity: 0.4; cursor: default; }
.ci-send:hover:not(:disabled) { background: rgba(var(--v-theme-primary), 0.22); }
</style>
