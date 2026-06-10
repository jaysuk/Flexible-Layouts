<template>
	<v-dialog :model-value="modelValue" max-width="560" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-share-variant</v-icon>
				{{ $t("plugins.flexibleLayouts.io.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<!-- Default view: export + import entry points -->
				<template v-if="!pending">
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.exportHeading") }}</div>
					<v-text-field v-model="layoutName" density="compact" variant="outlined" hide-details
								  class="mb-2" :label="$t('plugins.flexibleLayouts.io.layoutName')" />

					<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.io.includeHeading") }}</div>
					<div class="d-flex flex-wrap">
						<v-checkbox v-model="inc.theme" :label="$t('plugins.flexibleLayouts.io.partTheme')" density="compact" hide-details class="me-3" />
						<v-checkbox v-model="inc.header" :label="$t('plugins.flexibleLayouts.io.partHeader')" density="compact" hide-details class="me-3" />
						<v-checkbox v-model="inc.pages" :label="$t('plugins.flexibleLayouts.io.partPages')" density="compact" hide-details class="me-3" />
						<v-checkbox v-model="inc.settings" :label="$t('plugins.flexibleLayouts.io.partSettings')" density="compact" hide-details />
					</div>
					<v-btn color="primary" prepend-icon="mdi-download" class="mt-1" :disabled="!anyIncluded" @click="onExport">
						{{ $t("plugins.flexibleLayouts.io.export") }}
					</v-btn>

					<v-divider class="my-4" />

					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.exportPageHeading") }}</div>
					<div class="d-flex align-center ga-2">
						<v-select v-model="singlePage" :items="pageItems" item-title="label" item-value="path" density="compact"
								  variant="outlined" hide-details :placeholder="$t('plugins.flexibleLayouts.io.choosePage')" class="flex-grow-1" />
						<v-btn variant="tonal" prepend-icon="mdi-download" :disabled="!singlePage" @click="onExportPage">
							{{ $t("plugins.flexibleLayouts.io.exportPageBtn") }}
						</v-btn>
					</div>

					<v-divider class="my-4" />

					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.importHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.io.importHelp") }}</div>
					<v-btn variant="tonal" prepend-icon="mdi-upload" @click="pickFile">
						{{ $t("plugins.flexibleLayouts.io.import") }}
					</v-btn>
					<input ref="fileInput" type="file" accept=".json,application/json" class="d-none" @change="onFile" />
					<div class="text-caption mt-2">
						<a :href="GALLERY_URL" target="_blank" rel="noopener" class="text-primary">
							<v-icon size="14" class="me-1">mdi-view-gallery-outline</v-icon>{{ $t("plugins.flexibleLayouts.io.galleryLink") }}
						</a>
					</div>
					<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>

					<v-divider class="my-4" />

					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.samplesHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.io.samplesHelp") }}</div>
					<v-btn variant="tonal" prepend-icon="mdi-saw-blade" @click="onLoadCnc">
						{{ $t("plugins.flexibleLayouts.io.sampleCnc") }}
					</v-btn>
				</template>

				<!-- Import: choose what to restore -->
				<template v-else>
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.io.restoreHeading") }}</div>
					<div class="d-flex flex-wrap mb-1">
						<v-checkbox v-if="present.theme" v-model="restore.theme" :label="$t('plugins.flexibleLayouts.io.partTheme')" density="compact" hide-details class="me-3" />
						<v-checkbox v-if="present.header" v-model="restore.header" :label="$t('plugins.flexibleLayouts.io.partHeader')" density="compact" hide-details class="me-3" />
						<v-checkbox v-model="restore.settings" :label="$t('plugins.flexibleLayouts.io.partSettings')" density="compact" hide-details />
					</div>

					<template v-if="importPages.length">
						<div class="d-flex align-center">
							<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.io.partPages") }}</span>
							<v-spacer />
							<v-btn size="x-small" variant="text" @click="toggleAllPages">
								{{ allPagesSelected ? $t("plugins.flexibleLayouts.io.selectNone") : $t("plugins.flexibleLayouts.io.selectAll") }}
							</v-btn>
						</div>
						<v-checkbox v-for="p in importPages" :key="p.path" v-model="selectedPages" :value="p.path"
									:label="p.label" density="compact" hide-details />
					</template>

					<v-alert v-if="pending.missing.length > 0" type="warning" variant="tonal" density="compact" class="mt-3">
						<div class="text-body-2 mb-1">{{ $t("plugins.flexibleLayouts.io.missingHelp") }}</div>
						<div v-for="dep in pending.missing" :key="dep.pluginId" class="text-caption">• {{ dep.name }} ({{ dep.pluginId }})</div>
					</v-alert>
				</template>
			</v-card-text>

			<v-card-actions v-if="pending">
				<v-spacer />
				<v-btn variant="text" @click="cancelImport">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="primary" :disabled="!anyRestoreSelected" @click="confirmImport">
					{{ $t("plugins.flexibleLayouts.io.applyImport") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import i18n from "@/i18n";
import { LogLevel, useUiStore } from "@/stores/ui";

import { applyImportedDocument, exportLayout, exportPage, listDocumentPages, type ParsedImport, parseLayoutFile, parsePageFile, parsePanelFile } from "../model/io";
import { createCustomPage } from "../model/pageManager";
import { loadCncPreset } from "../model/presets";
import { useLayoutStore } from "../model/store";
import { describeWidget } from "../widgets/registry";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const GALLERY_URL = "https://jaysuk.github.io/flexible-layouts-gallery/";

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

// --- export ------------------------------------------------------------------------
const inc = reactive({ theme: true, header: true, pages: true, settings: true });
const anyIncluded = computed(() => inc.theme || inc.header || inc.pages || inc.settings);
const pageItems = computed(() => listDocumentPages(store.document.value));
const singlePage = ref<string | null>(null);

function onExport() {
	exportLayout({ theme: inc.theme, header: inc.header, pages: inc.pages, settings: inc.settings });
}
function onExportPage() {
	const entry = pageItems.value.find((p) => p.path === singlePage.value);
	if (entry) {
		exportPage(entry.path, entry.label);
	}
}

// --- import ------------------------------------------------------------------------
const restore = reactive({ theme: true, header: true, settings: true });
const selectedPages = ref<Array<string>>([]);

const present = computed(() => {
	const d = pending.value?.document;
	return {
		theme: !!d && (d.theme?.enabled || Object.keys(d.theme?.colors ?? {}).length > 0),
		header: !!d?.header,
	};
});
const importPages = computed(() => (pending.value ? listDocumentPages(pending.value.document) : []));
const allPagesSelected = computed(() => importPages.value.length > 0 && selectedPages.value.length === importPages.value.length);
const anyRestoreSelected = computed(() =>
	(present.value.theme && restore.theme) || (present.value.header && restore.header) || restore.settings || selectedPages.value.length > 0);

function toggleAllPages() {
	selectedPages.value = allPagesSelected.value ? [] : importPages.value.map((p) => p.path);
}

function pickFile() {
	error.value = "";
	fileInput.value?.click();
}

async function onFile(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = "";
	if (!file) {
		return;
	}
	error.value = "";
	const text = await file.text();

	// Peek at the file kind so the one Import button accepts a whole layout, a single page, or a
	// single panel/custom widget. Pages and panels each land on a new custom page we navigate to
	// (a fresh page mount renders reliably); a full layout opens the selective-restore view.
	let kind: string | undefined;
	try {
		kind = (JSON.parse(text) as { kind?: string }).kind;
	} catch {
		error.value = i18n.global.t("plugins.flexibleLayouts.io.error.invalidJson");
		return;
	}

	try {
		if (kind === "dwcpage") {
			const parsed = parsePageFile(text);
			const path = createCustomPage({
				title: parsed.title || parsed.page.title || i18n.global.t("plugins.flexibleLayouts.io.importedPageTitle"),
				icon: parsed.icon || parsed.page.icon,
			});
			store.setItems(path, parsed.page.items, "custom");
			uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.io.importedPage"));
			close();
			router.push(path);
			return;
		}
		if (kind === "dwcpanel") {
			const item = parsePanelFile(text);
			const name = item.title || describeWidget(item.widget).title;
			const path = createCustomPage({ title: i18n.global.t("plugins.flexibleLayouts.io.importedPanelTitle", { name }) });
			store.setItems(path, [{ ...item, x: 0, y: 0 }], "custom");
			uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.io.importedPanel"));
			close();
			router.push(path);
			return;
		}
		// Otherwise treat it as a full layout and open the selective-restore view.
		const parsed = parseLayoutFile(text);
		pending.value = parsed;
		// Default selection: everything the file contains.
		restore.theme = true;
		restore.header = true;
		restore.settings = true;
		selectedPages.value = listDocumentPages(parsed.document).map((p) => p.path);
	} catch (e) {
		const code = (e as Error).message;
		const known = ["invalidJson", "notALayout", "notAPage", "notAPanel"];
		error.value = i18n.global.t(`plugins.flexibleLayouts.io.error.${known.includes(code) ? code : "generic"}`);
	}
}

function cancelImport() {
	pending.value = null;
}

function confirmImport() {
	if (!pending.value) {
		return;
	}
	applyImportedDocument(pending.value.document, {
		theme: present.value.theme && restore.theme,
		header: present.value.header && restore.header,
		settings: restore.settings,
		pages: selectedPages.value,
	});
	uiStore.log(LogLevel.success, i18n.global.t("plugins.flexibleLayouts.io.imported"));
	close();
}

function close() {
	pending.value = null;
	error.value = "";
	emit("update:modelValue", false);
}

function onLoadCnc() {
	const path = loadCncPreset();
	close();
	router.push(path);
}
</script>
