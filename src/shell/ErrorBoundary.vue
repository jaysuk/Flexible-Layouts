<template>
	<div v-if="error" class="pa-6 text-center">
		<v-icon color="error" size="56" class="mb-3">mdi-alert-circle-outline</v-icon>
		<div class="text-title-medium mb-2">{{ $t("plugins.flexibleLayouts.errorBoundary.title") }}</div>
		<div class="text-body-2 text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.errorBoundary.help") }}</div>
		<pre v-if="message" class="text-caption text-medium-emphasis mb-4 flex-error-msg">{{ message }}</pre>
		<div class="d-flex justify-center flex-wrap ga-3">
			<v-btn color="primary" prepend-icon="mdi-refresh" @click="reset">
				{{ $t("plugins.flexibleLayouts.errorBoundary.retry") }}
			</v-btn>
			<v-btn variant="tonal" prepend-icon="mdi-bug" @click="downloadDiagnostics">
				{{ $t("plugins.flexibleLayouts.diagnostics.download") }}
			</v-btn>
			<v-btn variant="tonal" href="/BuiltInLayout">
				{{ $t("plugins.flexibleLayouts.errorBoundary.builtIn") }}
			</v-btn>
		</div>
	</div>
	<slot v-else />
</template>

<script setup lang="ts">
import { onErrorCaptured, ref, watch } from "vue";

import { buildReport, downloadReport, recordError } from "dwc-plugin-runtime";

import { useMachineStore } from "@/stores/machine";

import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { useLayoutStore } from "../model/store";

// Catches render/setup/lifecycle errors thrown by descendants and shows a recovery panel instead
// of letting the whole page/shell go blank. `resetKey` clears the error when it changes (e.g. on
// navigation) WITHOUT remounting the slot - keying the slot by route would force a full remount on
// every param change, breaking page components that update reactively across params (e.g. the
// Explorer's tabs).
const props = defineProps<{ resetKey?: unknown }>();

const error = ref(false);
const message = ref("");

watch(() => props.resetKey, () => {
	error.value = false;
	message.value = "";
});

onErrorCaptured((err) => {
	error.value = true;
	message.value = (err as Error)?.message ?? String(err);
	console.error("[FlexibleLayouts] error boundary caught:", err);
	recordError("page", err); // buffer for the diagnostic report
	return false; // stop propagation - we've handled it
});

function reset() {
	error.value = false;
	message.value = "";
}

// Capture a diagnostic report from the error screen — includes the buffered error, versions and a
// scrubbed object model, plus the full layout document so the broken page can be reproduced/recovered.
function downloadDiagnostics() {
	downloadReport(buildReport({
		pluginId: PLUGIN_MANIFEST_ID,
		model: useMachineStore().model,
		state: { document: useLayoutStore().document.value },
		note: `page render error: ${message.value}`,
	}));
}
</script>

<style scoped>
.flex-error-msg {
	white-space: pre-wrap;
	max-height: 120px;
	overflow: auto;
}
</style>
