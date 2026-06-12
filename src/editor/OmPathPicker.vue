<template>
	<v-dialog :model-value="modelValue" max-width="580" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-file-tree</v-icon>
				{{ $t("plugins.flexibleLayouts.omPicker.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<!-- Breadcrumb -->
			<div class="px-4 pb-1 d-flex align-center flex-wrap text-body-2">
				<a class="crumb" @click="goTo(0)">{{ $t("plugins.flexibleLayouts.omPicker.root") }}</a>
				<template v-for="(seg, i) in stack" :key="i">
					<span class="mx-1 text-medium-emphasis">/</span>
					<a class="crumb" @click="goTo(i + 1)">{{ seg }}</a>
				</template>
			</div>

			<v-text-field v-model="search" class="mx-4" density="compact" variant="outlined" hide-details
						  clearable prepend-inner-icon="mdi-magnify"
						  :placeholder="$t('plugins.flexibleLayouts.omPicker.search')" />

			<v-card-text style="max-height: 50vh;">
				<v-list density="compact">
					<v-list-item v-for="entry in filtered" :key="entry.key"
								 :prepend-icon="entry.expandable ? 'mdi-folder-outline' : 'mdi-circle-small'"
								 :title="entry.key" :subtitle="entry.preview"
								 @click="onRow(entry)">
						<template #append>
							<v-btn v-if="!entry.expandable" size="x-small" variant="tonal" color="primary"
								   @click.stop="select(entry.key)">
								{{ $t("plugins.flexibleLayouts.omPicker.use") }}
							</v-btn>
							<v-icon v-else size="small">mdi-chevron-right</v-icon>
						</template>
					</v-list-item>
					<v-list-item v-if="filtered.length === 0"
								 :title="$t('plugins.flexibleLayouts.omPicker.empty')" disabled />
				</v-list>
			</v-card-text>

			<v-card-actions>
				<span class="text-caption text-medium-emphasis text-truncate">{{ currentPath || $t("plugins.flexibleLayouts.omPicker.root") }}</span>
				<v-spacer />
				<v-btn v-if="stack.length > 0" variant="tonal" color="primary" @click="selectCurrent">
					{{ $t("plugins.flexibleLayouts.omPicker.useThis") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import { buildOmPath, omChildren, resolveOmPath } from "../util/omPath";

const props = defineProps<{ modelValue: boolean; path?: string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; select: [string] }>();

const machineStore = useMachineStore();

const stack = ref<Array<string>>([]);
const search = ref("");

// Seed the breadcrumb from an existing path when the dialog opens.
watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			search.value = "";
			stack.value = (props.path ?? "")
				.replace(/\[(\d+)\]/g, ".$1")
				.split(".")
				.map((s) => s.trim())
				.filter(Boolean);
			// Drop trailing segment if it's a leaf, so we land on its container.
			while (stack.value.length && !isContainer(resolveOmPath(machineStore.model, buildOmPath(stack.value)))) {
				stack.value.pop();
			}
		}
	},
);

const currentPath = computed(() => buildOmPath(stack.value));

const currentNode = computed(() =>
	stack.value.length === 0 ? machineStore.model : resolveOmPath(machineStore.model, currentPath.value));

interface Entry { key: string; expandable: boolean; preview: string }

function isContainer(v: unknown): boolean {
	return typeof v === "object" && v !== null;
}

function preview(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return `[${v.length}]`;
	if (v instanceof Map) return `{${v.size}}`;
	if (typeof v === "object") return "{…}";
	const s = String(v);
	return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

const entries = computed<Array<Entry>>(() => {
	const node = currentNode.value;
	if (!isContainer(node)) {
		return [];
	}
	// omChildren handles plain objects, arrays AND Maps - parts of the model (global, plugins, ...)
	// are Maps, which Object.keys() silently enumerates as empty.
	return omChildren(node)
		.filter(([key, value]) => !key.startsWith("_") && typeof value !== "function")
		.map(([key, value]) => ({ key, expandable: isContainer(value), preview: preview(value) }));
});

const filtered = computed(() => {
	const q = (search.value ?? "").trim().toLowerCase();
	return q ? entries.value.filter((e) => e.key.toLowerCase().includes(q)) : entries.value;
});

function onRow(entry: Entry) {
	if (entry.expandable) {
		stack.value = [...stack.value, entry.key];
		search.value = "";
	} else {
		select(entry.key);
	}
}

function select(key: string) {
	emit("select", buildOmPath([...stack.value, key]));
	emit("update:modelValue", false);
}

function selectCurrent() {
	emit("select", currentPath.value);
	emit("update:modelValue", false);
}

function goTo(depth: number) {
	stack.value = stack.value.slice(0, depth);
	search.value = "";
}
</script>

<style scoped>
.crumb {
	cursor: pointer;
	color: rgb(var(--v-theme-primary));
}
.crumb:hover {
	text-decoration: underline;
}
</style>
