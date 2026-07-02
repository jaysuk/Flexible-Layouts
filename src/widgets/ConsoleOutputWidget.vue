<template>
	<div class="co-root fill-height d-flex flex-column pa-1">
		<div ref="log" class="co-log flex-grow-1">
			<div v-for="(m, i) in entries" :key="i" class="co-entry" :class="`co-${m.type}`">
				<div v-if="m.title" class="co-title">{{ m.title }}</div>
				<pre v-if="m.message" class="co-msg">{{ m.message }}</pre>
			</div>
			<div v-if="!entries.length" class="co-empty text-medium-emphasis text-caption">
				{{ $t("plugins.flexibleLayouts.consoleOutput.empty") }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import type { Widget } from "../model/document";
import { useAutoScroll, useConsoleEntries } from "../util/consoleLog";

const props = defineProps<{ widget: Extract<Widget, { type: "consoleOutput" }> }>();
const log = ref<HTMLElement | null>(null);

const entries = useConsoleEntries(() => props.widget.rows ?? 20);
useAutoScroll(entries, log);
</script>

<style scoped>
.co-root { min-height: 0; }
.co-log { min-height: 0; overflow-y: auto; font-family: monospace; font-size: 0.75em; }
.co-entry { margin-bottom: 4px; }
.co-title { color: rgb(var(--v-theme-primary)); font-weight: 600; }
.co-msg { white-space: pre-wrap; margin: 0; opacity: 0.9; }
.co-error .co-title, .co-error .co-msg { color: rgb(var(--v-theme-error)); opacity: 1; }
.co-warning .co-title, .co-warning .co-msg { color: rgb(var(--v-theme-warning)); opacity: 1; }
</style>
