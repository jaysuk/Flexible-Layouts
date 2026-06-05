<template>
	<v-dialog :model-value="modelValue" max-width="520" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-share-variant</v-icon>
				{{ $t("plugins.flexibleLayouts.io.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<!-- Default view: export + import entry points -->
				<template v-if="!pending">
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.exportHeading") }}</div>
					<v-text-field v-model="layoutName" density="compact" variant="outlined" hide-details
								  class="mb-2" :label="$t('plugins.flexibleLayouts.io.layoutName')" />
					<v-btn color="primary" prepend-icon="mdi-download" @click="onExport">
						{{ $t("plugins.flexibleLayouts.io.export") }}
					</v-btn>

					<v-divider class="my-4" />

					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.importHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.io.importHelp") }}
					</div>
					<v-btn variant="tonal" prepend-icon="mdi-upload" @click="pickFile">
						{{ $t("plugins.flexibleLayouts.io.import") }}
					</v-btn>
					<input ref="fileInput" type="file" accept=".json,application/json" class="d-none"
						   @change="onFile" />
					<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
						{{ error }}
					</v-alert>

					<v-divider class="my-4" />

					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.samplesHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.io.samplesHelp") }}
					</div>
					<v-btn variant="tonal" prepend-icon="mdi-saw-blade" @click="onLoadCnc">
						{{ $t("plugins.flexibleLayouts.io.sampleCnc") }}
					</v-btn>
				</template>

				<!-- Import confirmation: shows missing dependencies before applying -->
				<template v-else>
					<v-alert type="warning" variant="tonal" density="comfortable" class="mb-3">
						{{ $t("plugins.flexibleLayouts.io.replaceWarning") }}
					</v-alert>

					<div v-if="pending.missing.length > 0">
						<div class="text-title-small mb-1">
							<v-icon size="small" color="warning" class="me-1">mdi-puzzle-remove</v-icon>
							{{ $t("plugins.flexibleLayouts.io.missingHeading") }}
						</div>
						<div class="text-caption text-medium-emphasis mb-2">
							{{ $t("plugins.flexibleLayouts.io.missingHelp") }}
						</div>
						<v-list density="compact">
							<v-list-item v-for="dep in pending.missing" :key="dep.pluginId"
										 :title="dep.name" :subtitle="dep.pluginId" prepend-icon="mdi-puzzle-outline" />
						</v-list>
					</div>
					<div v-else class="d-flex align-center text-success mb-2">
						<v-icon class="me-1">mdi-check-circle</v-icon>
						{{ $t("plugins.flexibleLayouts.io.allPresent") }}
					</div>
				</template>
			</v-card-text>

			<v-card-actions v-if="pending">
				<v-spacer />
				<v-btn variant="text" @click="cancelImport">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="primary" @click="confirmImport">
					{{ pending.missing.length > 0
						? $t("plugins.flexibleLayouts.io.importAnyway")
						: $t("plugins.flexibleLayouts.io.applyImport") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import i18n from "@/i18n";
import { LogLevel, useUiStore } from "@/stores/ui";

import { applyImportedDocument, exportLayout, type ParsedImport, parseLayoutFile } from "../model/io";
import { loadCncPreset } from "../model/presets";
import { useLayoutStore } from "../model/store";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const store = useLayoutStore();
const uiStore = useUiStore();
const router = useRouter();

const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref<ParsedImport | null>(null);
const error = ref("");

const layoutName = computed({
	get: () => store.document.value.meta.name,
	set: (v: string) => { store.document.value.meta.name = v; },
});

function close() {
	pending.value = null;
	error.value = "";
	emit("update:modelValue", false);
}

function onExport() {
	exportLayout();
}

function pickFile() {
	error.value = "";
	fileInput.value?.click();
}

async function onFile(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = ""; // allow re-selecting the same file later
	if (!file) {
		return;
	}
	try {
		const text = await file.text();
		pending.value = parseLayoutFile(text);
	} catch (e) {
		const code = (e as Error).message;
		const key = code === "invalidJson" || code === "notALayout" ? code : "generic";
		error.value = i18n.global.t(`plugins.flexibleLayouts.io.error.${key}`);
	}
}

function cancelImport() {
	pending.value = null;
}

function confirmImport() {
	if (!pending.value) {
		return;
	}
	applyImportedDocument(pending.value.document);
	uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.io.imported"));
	close();
}

function onLoadCnc() {
	const path = loadCncPreset();
	close();
	router.push(path);
}
</script>
