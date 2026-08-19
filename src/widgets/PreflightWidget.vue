<template>
	<div class="pfw-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.label" class="pfw-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div class="d-flex ga-1 align-center flex-shrink-0">
			<v-text-field v-model="filePath" density="compact" variant="outlined" hide-details
						  class="flex-grow-1" :label="$t('plugins.flexibleLayouts.preflight.file')"
						  placeholder="0:/gcodes/part.gcode" @change="patch?.({ defaultFile: filePath })" />
			<v-btn icon="mdi-file-find-outline" size="small" variant="tonal" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.filePicker.title')" @click="pickerOpen = true" />
			<v-btn size="small" :color="widget.color || 'primary'" :loading="checking" :disabled="!filePath"
				   @click="runCheck">{{ $t("plugins.flexibleLayouts.preflight.check") }}</v-btn>
		</div>

		<GcodeFilePickerDialog v-model="pickerOpen" @select="onFileSelected" />

		<div v-if="loadError" class="pfw-error mt-1 flex-shrink-0">{{ loadError }}</div>

		<div class="pfw-results flex-grow-1 mt-2">
			<div v-if="!checks.length && !checking" class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.preflight.noResults") }}
			</div>
			<div v-for="c in checks" :key="c.id" class="pfw-row" :class="`pfw-${c.level}`">
				<v-icon size="16" class="mr-1">{{ levelIcon(c.level) }}</v-icon>
				<span>{{ c.message }}</span>
			</div>
		</div>

		<v-expansion-panels variant="accordion" class="pfw-panels flex-shrink-0">
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.preflight.settingsTitle')">
				<v-expansion-panel-text>
					<v-text-field v-model.number="rapidRate" type="number" :min="1" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.preflight.rapidRate')"
								  @change="patch?.({ rapidRate })" />
				</v-expansion-panel-text>
			</v-expansion-panel>
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.preflight.toolTableTitle')">
				<v-expansion-panel-text>
					<div v-for="(t, i) in toolTable" :key="t.number" class="pfw-tool-row">
						<v-row dense>
							<v-col cols="2"><v-text-field v-model.number="t.number" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.preflight.toolNumber')" @change="saveToolTable" /></v-col>
							<v-col cols="4"><v-text-field v-model="t.name" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.preflight.toolName')" @change="saveToolTable" /></v-col>
							<v-col cols="3"><v-select v-model="t.type" :items="toolTypeItems" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.preflight.toolType')" @update:model-value="saveToolTable" /></v-col>
							<v-col cols="2"><v-text-field v-model.number="t.diameter" type="number" :min="0" :step="0.01" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.preflight.toolDiameter')" @change="saveToolTable" /></v-col>
							<v-col cols="1" class="d-flex align-center justify-end">
								<v-btn size="x-small" variant="text" icon @click="removeTool(i)"><v-icon size="16">mdi-delete-outline</v-icon></v-btn>
							</v-col>
						</v-row>
					</div>
					<v-btn size="small" variant="tonal" prepend-icon="mdi-plus" class="mt-2" @click="addTool">
						{{ $t("plugins.flexibleLayouts.preflight.addTool") }}
					</v-btn>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>
	</div>
</template>

<script setup lang="ts">
import { inject, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { parseGcodeAsync } from "../model/gcode/parseClient";
import { type CheckLevel, type PreflightCheck, type PreflightMachineState, runPreflight } from "../model/gcode/preflight";
import { resolveOmPath } from "../util/omPath";
import { getToolTable, setToolTable, type ToolTableEntry, type ToolType } from "../model/toolTable";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import GcodeFilePickerDialog from "./GcodeFilePickerDialog.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "preflight" }> }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);

const filePath = ref(props.widget.defaultFile || "");
const pickerOpen = ref(false);
function onFileSelected(path: string): void {
	filePath.value = path;
	patch?.({ defaultFile: path });
}
const rapidRate = ref(props.widget.rapidRate ?? 3000);
const checking = ref(false);
const loadError = ref("");
const checks = ref<Array<PreflightCheck>>([]);

const toolTable = ref<Array<ToolTableEntry>>(getToolTable());
const toolTypeItems: Array<{ title: string; value: ToolType }> = [
	{ title: "Endmill", value: "endmill" },
	{ title: "Ball nose", value: "ballnose" },
	{ title: "V-bit", value: "vbit" },
	{ title: "Chamfer", value: "chamfer" },
	{ title: "Drill", value: "drill" },
	{ title: "Surfacing", value: "surfacing" },
	{ title: "Engraver", value: "engraver" },
	{ title: "Other", value: "other" },
];

function saveToolTable(): void {
	setToolTable(toolTable.value);
}
function addTool(): void {
	const nextNumber = toolTable.value.length ? Math.max(...toolTable.value.map((t) => t.number)) + 1 : 0;
	toolTable.value = [...toolTable.value, { number: nextNumber }];
	saveToolTable();
}
function removeTool(index: number): void {
	toolTable.value = toolTable.value.filter((_, i) => i !== index);
	saveToolTable();
}

function levelIcon(level: CheckLevel): string {
	switch (level) {
		case "ok": return "mdi-check-circle";
		case "warn": return "mdi-alert";
		case "error": return "mdi-close-circle";
		default: return "mdi-information-outline";
	}
}

interface RawAxis { letter?: string; homed?: boolean; min?: number; max?: number; speed?: number; machinePosition?: number | null; userPosition?: number | null }
interface RawSpindle { min?: number | null; max?: number | null }

function readMachineState(): PreflightMachineState {
	const rawAxes = resolveOmPath(machineStore.model, "move.axes");
	const axes = (Array.isArray(rawAxes) ? (rawAxes as Array<RawAxis>) : [])
		.filter((a) => a?.letter)
		.map((a) => ({
			letter: (a.letter ?? "").toUpperCase(),
			homed: !!a.homed,
			min: a.min ?? 0,
			max: a.max ?? 0,
			speed: a.speed ?? 0,
			machinePosition: a.machinePosition ?? 0,
			userPosition: a.userPosition ?? 0,
		}));
	const rawSpindles = resolveOmPath(machineStore.model, "spindles");
	const spindles = (Array.isArray(rawSpindles) ? (rawSpindles as Array<RawSpindle | null>) : [])
		.filter((s): s is RawSpindle => !!s && s.min != null && s.max != null)
		.map((s) => ({ min: s.min as number, max: s.max as number }));
	return { axes, spindles };
}

async function runCheck(): Promise<void> {
	if (!filePath.value) { return; }
	checking.value = true;
	loadError.value = "";
	checks.value = [];
	try {
		const text = await machineStore.download({ filename: filePath.value, type: "text" }, true, false, false, false) as string;
		const parse = await parseGcodeAsync(text);
		checks.value = runPreflight(parse, readMachineState(), toolTable.value, { rapidRate: rapidRate.value });
	} catch (e) {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.preflight.loadFailed", { error: (e as Error)?.message ?? String(e) });
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.preflight.title"), loadError.value);
	} finally {
		checking.value = false;
	}
}

</script>

<style scoped>
.pfw-root { min-height: 0; }
.pfw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.pfw-error { color: rgb(var(--v-theme-error)); font-size: 0.8em; }
.pfw-results { min-height: 0; overflow-y: auto; }
.pfw-row { display: flex; align-items: center; padding: 2px 0; font-size: 0.82em; }
.pfw-ok { color: rgb(var(--v-theme-success)); }
.pfw-warn { color: rgb(var(--v-theme-warning)); }
.pfw-error.pfw-row { color: rgb(var(--v-theme-error)); }
.pfw-panels { max-height: 45%; overflow-y: auto; }
.pfw-tool-row { margin-bottom: 4px; }
</style>
