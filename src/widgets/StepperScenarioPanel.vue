<style scoped>
.scenario-section-title {
	font-size: 0.6875rem;
	font-weight: 600;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	opacity: 0.7;
}
.scenario-info {
	opacity: 0.6;
	cursor: help;
}
.scenario-name {
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
	font-size: 0.8125rem;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}
.axis-capsule {
	display: flex;
	align-items: center;
	height: 2.25rem;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 8px;
	overflow: hidden;
}
.axis-capsule__letter {
	width: 1.5rem;
	text-align: center;
	font-size: 0.75rem;
	font-weight: 700;
	opacity: 0.7;
	flex: none;
}
.axis-capsule :deep(.v-field__input) {
	width: 3.25rem;
	min-width: 0;
	padding: 0 0.375rem;
	text-align: right;
}
.mini-field {
	display: flex;
	flex-direction: column;
	justify-content: center;
	width: 5.25rem;
	height: 2.25rem;
	box-sizing: border-box;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 8px;
	padding: 0 0.5rem;
}
.mini-field__label {
	font-size: 0.5625rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	opacity: 0.6;
	line-height: 1;
}
.mini-field :deep(.v-field__input) {
	padding: 0;
	min-height: 0;
}
.values-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 0.125rem 1.25rem;
	max-height: 16rem;
	overflow-y: auto;
	align-content: start;
	padding-right: 0.25rem;
}
.value-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	min-height: 2rem;
	padding: 0 0.25rem;
	border-radius: 4px;
}
.value-row:hover {
	background: rgba(var(--v-border-color), 0.06);
}
.value-row--pending {
	background: rgba(var(--v-theme-warning), 0.12);
}
.value-row__name {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
	flex: 1 1 auto;
}
.value-row__lines {
	flex: none;
	font-size: 0.6875rem;
	opacity: 0.6;
}
.value-row__field {
	flex: none;
	width: 6.5rem;
}
</style>

<template>
	<div class="stepper-scenario">
		<div class="d-flex align-center ga-2 mb-3">
			<span class="scenario-section-title">Scenario</span>
			<span class="text-caption text-medium-emphasis">{{ setCount }} set</span>
			<v-spacer />
			<v-btn v-if="!isEmptySimulationInputs(inputs)" size="small" variant="text" density="compact"
				   prepend-icon="mdi-refresh" @click="emit('update:inputs', emptySimulationInputs())">Clear everything</v-btn>
		</div>

		<div class="d-flex align-center ga-1 mb-2">
			<span class="scenario-section-title">Starting position</span>
			<v-tooltip location="bottom" max-width="20rem">
				<template #activator="{ props: tip }">
					<v-icon v-bind="tip" icon="mdi-information-outline" size="14" class="scenario-info" />
				</template>
				Where the machine is before line 1 runs. A macro that moves relative to the current position, or
				reads <code>move.axes[n].userPosition</code>, starts from these. Leave an axis blank if it is unknown.
			</v-tooltip>
		</div>
		<div class="d-flex flex-wrap ga-2 align-center mb-3">
			<div v-for="letter in startAxes" :key="letter" class="axis-capsule" :data-scenario-axis="letter">
				<span class="axis-capsule__letter">{{ letter }}</span>
				<ScenarioValueField :model-value="axisText(letter)" variant="plain" hide-details :aria-label="`Start ${letter}`"
									@commit="(text: string) => commitAxis(letter, text)" />
				<v-btn :icon="isHomed(letter) ? 'mdi-home' : 'mdi-home-outline'" size="x-small" variant="text" density="compact"
					   :color="isHomed(letter) ? 'primary' : undefined" :aria-pressed="isHomed(letter)"
					   :title="`${letter} starts ${isHomed(letter) ? 'homed' : 'not homed'} — click to toggle`"
					   @click="emit('update:inputs', withStartHomed(inputs, letter, !isHomed(letter)))" />
				<v-btn v-if="isExtraAxis(letter)" icon="mdi-close" size="x-small" variant="text" density="compact"
					   :title="`Remove axis ${letter}`" @click="emit('update:inputs', withDeclaredAxis(inputs, letter, false))" />
			</div>
			<v-select v-if="addableAxes.length > 0" :items="addableAxes" density="compact" hide-details variant="outlined"
					  label="+ Axis" style="max-width: 6rem" aria-label="Add axis" :model-value="null"
					  @update:model-value="(letter: string | null) => letter !== null && emit('update:inputs', withDeclaredAxis(inputs, letter, true))" />

			<v-divider vertical class="mx-1" />

			<div class="mini-field">
				<span class="mini-field__label">Tool</span>
				<ScenarioValueField :model-value="numberText('tool')" variant="plain" hide-details aria-label="Start tool"
									@commit="(text: string) => commitNumber('tool', text)" />
			</div>
			<div class="mini-field">
				<span class="mini-field__label">Feed F</span>
				<ScenarioValueField :model-value="numberText('feedrate')" variant="plain" hide-details aria-label="Start feedrate"
									@commit="(text: string) => commitNumber('feedrate', text)" />
			</div>
			<div class="mini-field">
				<span class="mini-field__label">Extr E</span>
				<ScenarioValueField :model-value="numberText('e')" variant="plain" hide-details aria-label="Start extruder position"
									@commit="(text: string) => commitNumber('e', text)" />
			</div>

			<v-btn size="small" variant="tonal" density="comfortable" :aria-pressed="inputs.start.relativeMoves === true"
				   :color="inputs.start.relativeMoves === true ? 'primary' : undefined"
				   @click="emit('update:inputs', withStartMode(inputs, 'relativeMoves', inputs.start.relativeMoves !== true))">
				G91 relative
			</v-btn>
			<v-btn size="small" variant="tonal" density="comfortable" :aria-pressed="inputs.start.relativeE === true"
				   :color="inputs.start.relativeE === true ? 'primary' : undefined"
				   @click="emit('update:inputs', withStartMode(inputs, 'relativeE', inputs.start.relativeE !== true))">
				M83 relative E
			</v-btn>
		</div>

		<v-divider class="mb-3" />

		<div class="d-flex align-center ga-1 mb-2">
			<span class="scenario-section-title">Values this file reads</span>
			<v-tooltip location="bottom" max-width="24rem">
				<template #activator="{ props: tip }">
					<v-icon v-bind="tip" icon="mdi-information-outline" size="14" class="scenario-info" />
				</template>
				Object-model paths, macro arguments (<code>param.*</code>) and globals the file uses but doesn't set.
				Give each the value to test with (<code>1</code>, <code>true</code>, <code>"text"</code>,
				<code>[1, 2]</code>, <code>null</code>); change it and the run repeats. A blank one asks when reached,
				or - for a global - doesn't exist.
			</v-tooltip>
			<v-spacer />
			<span v-if="rows.length > 0" class="text-caption text-medium-emphasis">{{ filteredRows.length }} / {{ rows.length }}</span>
			<v-text-field v-if="rows.length > 5" v-model="filterText" density="compact" variant="outlined" hide-details
						  prepend-inner-icon="mdi-magnify" placeholder="Filter…" aria-label="Filter values this file reads"
						  style="max-width: 12rem" clearable />
		</div>

		<template v-if="rows.length > 0">
			<div class="values-grid mb-2" data-scenario-values>
				<div v-for="row in filteredRows" :key="row.key" class="value-row" :class="{ 'value-row--pending': row.pending }"
					 :data-scenario-input="row.key">
					<div class="value-row__name">
						<v-chip v-if="row.pending" size="x-small" color="warning">needs a value</v-chip>
						<v-chip v-if="row.input.known === false" size="x-small" color="error"
								title="Not a known object-model path at this RRF version">unknown path</v-chip>
						<span class="scenario-name" :title="row.label">{{ row.label }}</span>
						<span class="value-row__lines" :title="row.linesTitle">{{ row.linesShort }}</span>
					</div>
					<span v-if="row.input.dynamic" class="text-caption text-medium-emphasis">computed — asked when reached</span>
					<ScenarioValueField v-else :model-value="row.text" variant="underlined" hide-details :placeholder="row.placeholder"
										class="value-row__field" :aria-label="`Value of ${row.label}`"
										@commit="(text: string) => commitValue(row.input.kind, row.input.name, text)" />
				</div>
			</div>
			<div v-if="filteredRows.length === 0" class="text-caption font-italic text-medium-emphasis mb-2">
				No matches for "{{ filterText }}".
			</div>
		</template>
		<div v-else class="text-caption font-italic mb-2">This file doesn't read any object-model values, arguments or undeclared globals.</div>

		<template v-if="otherValues.length > 0">
			<div class="d-flex flex-wrap ga-1 align-center mb-2">
				<span class="text-caption text-medium-emphasis">Other set:</span>
				<v-chip v-for="o in otherValues" :key="o.key" size="small" closable
						:title="'Click × to forget this value'" @click:close="emit('update:inputs', withInputValue(inputs, o.kind, o.name, undefined))">
					{{ o.label }} = {{ o.text }}
				</v-chip>
			</div>
		</template>

		<v-btn v-if="!addOpen" size="small" variant="text" density="compact" prepend-icon="mdi-plus" @click="addOpen = true">
			Add a value manually
		</v-btn>
		<div v-else class="d-flex flex-wrap ga-2 align-center">
			<!-- Plain fields, not ScenarioValueField: nothing here re-runs the walk until Add is pressed, and a
				 commit-on-blur field would race the Add button's own enabled state. -->
			<v-text-field v-model="newName" density="compact" hide-details variant="outlined" style="width: 16rem"
						  placeholder="e.g. heat.heaters[1].current" aria-label="Path to add"
						  spellcheck="false" autocomplete="off" @keyup.enter="addManual" />
			<v-text-field v-model="newValue" density="compact" hide-details variant="outlined" style="width: 10rem"
						  placeholder="e.g. 200" aria-label="Value for the added path"
						  spellcheck="false" autocomplete="off" @keyup.enter="addManual" />
			<v-btn size="small" variant="tonal" :disabled="newName.trim() === '' || newValue.trim() === ''" @click="addManual">Add</v-btn>
			<v-btn icon="mdi-close" size="x-small" variant="text" title="Cancel" aria-label="Cancel adding a value"
				   @click="addOpen = false; newName = ''; newValue = '';" />
		</div>
	</div>
</template>

<script setup lang="ts">
/**
 * The offline stepper's scenario editor: the starting position (X/Y/Z and any extra axis, which are
 * homed, tool, feedrate, extruder, G91/M83) and the values the file's expressions read (object-model
 * paths, `param.*`, globals), so a macro can be tested down every branch by changing one field.
 * Purely presentational - it edits a `SimulationInputs` (`dwc-gcode-core/stepper/simulation`, which
 * owns every edit rule) and emits the new one; `GcodeEditor.vue` re-runs the walk and persists it.
 *
 * Kept compact deliberately (2026-09-28 redesign, after a real-browser report that the previous
 * layout - one stacked field+checkbox per axis, two long help paragraphs, one row per referenced
 * value - overflowed even a maximised panel on a 1920x1080 laptop): axes/tool/feedrate/modes are one
 * two-row strip, the long help text moved into `v-tooltip`s off an (i) icon, and "values this file
 * reads" is a filterable, multi-column, height-capped (`values-grid`, `max-height`+`overflow-y:auto`)
 * grid instead of one wide table row per entry - so however many values a file references, only that
 * grid scrolls; nothing below it can be pushed off screen. See the artifact this was designed from
 * (linked from the session that made this change) for the reasoning behind each specific control.
 */
import { computed, ref } from "vue";
import type { EvalValue } from "dwc-gcode-core";
import {
	emptySimulationInputs, formatEvalValue, getInputValue, isEmptySimulationInputs, withDeclaredAxis, withInputValue,
	withStartAxis, withStartHomed, withStartMode, withStartValue,
	type ReferencedInput, type ReferencedInputKind, type SimulationInputs,
} from "dwc-gcode-core/stepper/simulation";
import { parseSimulatedValueInput } from "dwc-gcode-core/stepper/simulatedValues";

import ScenarioValueField from "./ScenarioValueField.vue";

const props = defineProps<{
	inputs: SimulationInputs;
	/** What the file reads, from `findReferencedInputs`. */
	referenced: ReadonlyArray<ReferencedInput>;
	/** The path the walk is currently paused on, if any - highlighted so it's easy to find. */
	pendingPath: string | null;
}>();
const emit = defineEmits<{ "update:inputs": [SimulationInputs] }>();

const EXTRA_AXES: ReadonlyArray<string> = ["U", "V", "W", "A", "B", "C", "D"];

const declaredExtras = computed(() => {
	const letters = new Set<string>(props.inputs.start.axisLetters ?? []);
	for (const letter of Object.keys(props.inputs.start.axes ?? {})) letters.add(letter);
	return EXTRA_AXES.filter((l) => letters.has(l));
});
const startAxes = computed(() => ["X", "Y", "Z", ...declaredExtras.value]);
const addableAxes = computed(() => EXTRA_AXES.filter((l) => !declaredExtras.value.includes(l)));
const isExtraAxis = (letter: string): boolean => EXTRA_AXES.includes(letter);

function axisText(letter: string): string {
	const v = props.inputs.start.axes?.[letter];
	return v === undefined ? "" : String(v);
}
const isHomed = (letter: string): boolean => (props.inputs.start.homed ?? []).includes(letter);

function commitAxis(letter: string, text: string): void {
	const t = text.trim();
	if (t === "") { emit("update:inputs", withStartAxis(props.inputs, letter, null)); return; }
	const n = Number(t);
	if (Number.isFinite(n)) emit("update:inputs", withStartAxis(props.inputs, letter, n));
}

function numberText(key: "e" | "tool" | "feedrate"): string {
	const v = props.inputs.start[key];
	return v === undefined ? "" : String(v);
}
function commitNumber(key: "e" | "tool" | "feedrate", text: string): void {
	const t = text.trim();
	if (t === "") { emit("update:inputs", withStartValue(props.inputs, key, null)); return; }
	const n = Number(t);
	if (Number.isFinite(n)) emit("update:inputs", withStartValue(props.inputs, key, n));
}

/** How an input is labelled: a global/var as the file writes it, everything else by its path. */
function labelOf(kind: ReferencedInputKind, name: string): string {
	return kind === "global" ? `global.${name}` : kind === "var" ? `var.${name}` : name;
}
const keyOf = (kind: ReferencedInputKind, name: string): string => `${kind}:${name}`;

const rows = computed(() => props.referenced.map((input) => {
	const current = getInputValue(props.inputs, input.kind, input.name);
	const lines = input.lines.map((l) => l + 1);
	return {
		key: keyOf(input.kind, input.name),
		input,
		label: labelOf(input.kind, input.name),
		linesShort: lines.length === 1 ? `L${lines[0]}` : `L${lines[0]}+${lines.length - 1}`,
		linesTitle: `Line${lines.length === 1 ? "" : "s"} ${lines.join(", ")}`,
		text: current === undefined ? "" : formatEvalValue(current),
		placeholder: input.kind === "global" ? "not defined" : "not set",
		pending: props.pendingPath !== null && input.name === props.pendingPath,
	};
}));

const filterText = ref("");
const filteredRows = computed(() => {
	const needle = filterText.value.trim().toLowerCase();
	return needle === "" ? rows.value : rows.value.filter((row) => row.label.toLowerCase().includes(needle));
});

const otherValues = computed(() => {
	const referenced = new Set(props.referenced.map((r) => keyOf(r.kind, r.name)));
	const out: Array<{ key: string; kind: ReferencedInputKind; name: string; label: string; text: string }> = [];
	const collect = (map: ReadonlyMap<string, EvalValue>, kind: ReferencedInputKind): void => {
		for (const [name, value] of map) {
			const matchKind: ReferencedInputKind = kind === "objectModel" && name.startsWith("param.") ? "param" : kind;
			if (referenced.has(keyOf(matchKind, name))) continue;
			out.push({ key: keyOf(matchKind, name), kind: matchKind, name, label: labelOf(matchKind, name), text: formatEvalValue(value) });
		}
	};
	collect(props.inputs.paths, "objectModel");
	collect(props.inputs.globals, "global");
	collect(props.inputs.vars, "var");
	return out;
});

/** How many fields are actually set, shown next to the panel's own title instead of in one long sentence. */
const setCount = computed(() => {
	const axisCount = startAxes.value.filter((letter) => axisText(letter) !== "").length;
	return axisCount + props.inputs.paths.size + props.inputs.globals.size + props.inputs.vars.size;
});

function commitValue(kind: ReferencedInputKind, name: string, text: string): void {
	const t = text.trim();
	emit("update:inputs", withInputValue(props.inputs, kind, name, t === "" ? undefined : parseSimulatedValueInput(t)));
}

const addOpen = ref(false);
const newName = ref("");
const newValue = ref("");
function addManual(): void {
	const name = newName.value.trim();
	const value = newValue.value.trim();
	if (name === "" || value === "") return;
	emit("update:inputs", withInputValue(props.inputs, name.startsWith("param.") ? "param" : "objectModel", name, parseSimulatedValueInput(value)));
	newName.value = "";
	newValue.value = "";
	addOpen.value = false;
}
</script>
