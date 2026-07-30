<template>
	<div>
		<div class="d-flex flex-wrap align-center ga-2 mb-3">
			<v-text-field v-model="search" density="compact" variant="outlined" hide-details clearable
						  prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.flexibleLayouts.configBackup.restore.treeSearch')"
						  style="max-width: 260px;" />
			<v-btn size="small" variant="text" @click="selectAll">{{ $t("plugins.flexibleLayouts.configBackup.restore.treeSelectAll") }}</v-btn>
			<v-btn size="small" variant="text" @click="selectNone">{{ $t("plugins.flexibleLayouts.configBackup.restore.treeSelectNone") }}</v-btn>
			<v-btn size="small" variant="text" @click="selectSystemOnly">{{ $t("plugins.flexibleLayouts.configBackup.restore.treeSelectSystemOnly") }}</v-btn>
		</div>

		<div v-for="group in visibleGroups" :key="group.kind" class="mb-4">
			<div class="d-flex align-center ga-2 mb-1">
				<v-icon size="20" color="amber-darken-1">mdi-folder</v-icon>
				<span class="text-body-2 font-weight-bold">{{ group.label }}</span>
				<span class="text-caption text-medium-emphasis">({{ group.items.length }})</span>
			</div>

			<v-data-table :headers="headers" :items="group.items" item-value="path"
						   :model-value="kindSelectedArray(group.kind)" @update:model-value="onKindSelect(group.kind, $event)"
						   show-select hide-default-footer items-per-page="-1" density="compact" must-sort
						   :sort-by="[{ key: 'name', order: 'asc' }]">
				<template #item.name="{ item }">
					<div class="d-flex align-center">
						<v-icon size="small" class="me-2">{{ item.binary ? "mdi-file-image" : "mdi-file" }}</v-icon>
						<span v-if="item.dir" class="text-medium-emphasis">{{ item.dir }}/</span>
						<span>{{ item.baseName }}</span>
						<v-chip v-if="item.redacted" size="x-small" class="ms-2" color="warning" variant="tonal">
							{{ $t("plugins.flexibleLayouts.configBackup.redaction.redactedChip") }}
						</v-chip>
					</div>
				</template>
				<template #item.size="{ item }">
					{{ formatSize(item.size) }}
				</template>
			</v-data-table>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";

import { DIR_FOLDER } from "dwc-config-backup-core";
import type { BackupDirKind } from "dwc-config-backup-core";
import type { ManifestFile } from "dwc-config-backup-core";

const props = defineProps<{
	files: Array<ManifestFile>;
	modelValue: Set<string>;
}>();
const emit = defineEmits<{ "update:modelValue": [Set<string>] }>();

const selection = computed(() => props.modelValue);
const search = ref("");

const headers = [
	{ title: i18n.global.t("plugins.flexibleLayouts.configBackup.restore.treeColumnName"), key: "name" },
	{ title: i18n.global.t("plugins.flexibleLayouts.configBackup.restore.treeColumnSize"), key: "size", align: "end" as const },
];

interface Row { path: string; dir: string; baseName: string; size: number; binary: boolean; redacted: boolean }
interface Group { kind: BackupDirKind; label: string; items: Array<Row> }

const KIND_LABELS: Record<BackupDirKind, string> = { system: "0:/sys/", macros: "0:/macros/", filaments: "0:/filaments/" };

function relativePath(f: ManifestFile): string {
	const prefix = `files/${DIR_FOLDER[f.kind]}/`;
	return f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
}

function toRow(f: ManifestFile): Row {
	const rel = relativePath(f);
	const slash = rel.lastIndexOf("/");
	return {
		path: f.path, size: f.size, binary: f.binary, redacted: f.redacted,
		dir: slash === -1 ? "" : rel.slice(0, slash),
		baseName: slash === -1 ? rel : rel.slice(slash + 1),
	};
}

const groups = computed<Array<Group>>(() => {
	const byKind = new Map<BackupDirKind, Array<Row>>();
	for (const f of props.files) {
		if (!byKind.has(f.kind)) { byKind.set(f.kind, []); }
		byKind.get(f.kind)!.push(toRow(f));
	}
	return Array.from(byKind.entries()).map(([kind, items]) => ({ kind, label: KIND_LABELS[kind], items }));
});

const visibleGroups = computed<Array<Group>>(() => {
	const term = search.value.trim().toLowerCase();
	if (!term) { return groups.value; }
	return groups.value
		.map((g) => ({ ...g, items: g.items.filter((r) => `${r.dir}/${r.baseName}`.toLowerCase().includes(term)) }))
		.filter((g) => g.items.length > 0);
});

function kindPaths(kind: BackupDirKind): Array<string> {
	return groups.value.find((g) => g.kind === kind)?.items.map((r) => r.path) ?? [];
}
function kindSelectedArray(kind: BackupDirKind): Array<string> {
	return kindPaths(kind).filter((p) => selection.value.has(p));
}
function onKindSelect(kind: BackupDirKind, arr: Array<string>): void {
	const next = new Set(selection.value);
	for (const p of kindPaths(kind)) { next.delete(p); }
	for (const p of arr) { next.add(p); }
	emit("update:modelValue", next);
}

function selectAll(): void { emit("update:modelValue", new Set(props.files.map((f) => f.path))); }
function selectNone(): void { emit("update:modelValue", new Set()); }
function selectSystemOnly(): void { emit("update:modelValue", new Set(props.files.filter((f) => f.kind === "system").map((f) => f.path))); }

function formatSize(bytes: number): string {
	if (bytes < 1024) { return `${bytes} B`; }
	if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>
