<style scoped>
.scenario-section-title {
	font-size: 0.75rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	opacity: 0.7;
}
.scenario-axis {
	width: 7.5rem;
}
.scenario-name {
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
	font-size: 0.8125rem;
	word-break: break-all;
}
.scenario-row--pending {
	background: rgba(var(--v-theme-warning), 0.15);
}
</style>

<template>
	<div class="stepper-scenario">
		<div class="scenario-section-title mb-1">Starting position</div>
		<div class="text-caption text-medium-emphasis mb-2">
			Where the machine is before line 1 runs. A macro that moves relative to the current position, or reads
			<code>move.axes[n].userPosition</code>, starts from these. Leave an axis blank if it is unknown.
		</div>
		<div class="d-flex flex-wrap ga-2 align-start mb-2">
			<div v-for="letter in startAxes" :key="letter" class="scenario-axis" :data-scenario-axis="letter">
				<ScenarioValueField :model-value="axisText(letter)" :label="letter" :aria-label="`Start ${letter}`"
									:clearable="true" @commit="(text: string) => commitAxis(letter, text)" />
				<div class="d-flex align-center">
					<v-checkbox density="compact" hide-details :model-value="isHomed(letter)" :label="'Homed'"
								:aria-label="`${letter} starts homed`"
								@update:model-value="(v: boolean | null) => emit('update:inputs', withStartHomed(inputs, letter, v === true))" />
					<v-btn v-if="isExtraAxis(letter)" icon="mdi-close" size="x-small" variant="text"
						   :title="`Remove axis ${letter}`" @click="emit('update:inputs', withDeclaredAxis(inputs, letter, false))" />
				</div>
			</div>
			<v-select v-if="addableAxes.length > 0" :items="addableAxes" density="compact" hide-details variant="outlined"
					  label="Add axis" style="max-width: 7.5rem" aria-label="Add axis" :model-value="null"
					  @update:model-value="(letter: string | null) => letter !== null && emit('update:inputs', withDeclaredAxis(inputs, letter, true))" />
		</div>
		<div class="d-flex flex-wrap ga-2 align-center mb-1">
			<div style="width: 7.5rem">
				<ScenarioValueField :model-value="numberText('tool')" label="Tool" aria-label="Start tool" :clearable="true"
									@commit="(text: string) => commitNumber('tool', text)" />
			</div>
			<div style="width: 7.5rem">
				<ScenarioValueField :model-value="numberText('feedrate')" label="Feedrate F" aria-label="Start feedrate" :clearable="true"
									@commit="(text: string) => commitNumber('feedrate', text)" />
			</div>
			<div style="width: 7.5rem">
				<ScenarioValueField :model-value="numberText('e')" label="Extruder E" aria-label="Start extruder position" :clearable="true"
									@commit="(text: string) => commitNumber('e', text)" />
			</div>
			<v-switch density="compact" hide-details color="primary" label="Relative moves (G91)"
					  :model-value="inputs.start.relativeMoves === true"
					  @update:model-value="(v: boolean | null) => emit('update:inputs', withStartMode(inputs, 'relativeMoves', v === true))" />
			<v-switch density="compact" hide-details color="primary" label="Relative extrusion (M83)"
					  :model-value="inputs.start.relativeE === true"
					  @update:model-value="(v: boolean | null) => emit('update:inputs', withStartMode(inputs, 'relativeE', v === true))" />
		</div>

		<v-divider class="my-3" />

		<div class="scenario-section-title mb-1">Values this file reads</div>
		<div class="text-caption text-medium-emphasis mb-2">
			Object-model paths, macro arguments (<code>param.*</code>) and globals the file uses but doesn't set. Give each the value
			to test with (<code>1</code>, <code>true</code>, <code>"text"</code>, <code>[1, 2]</code>, <code>null</code>); change it
			and the run repeats. A blank one asks when reached, or - for a global - doesn't exist.
		</div>
		<v-table v-if="rows.length > 0" density="compact" class="mb-2">
			<tbody>
				<tr v-for="row in rows" :key="row.key" :class="{ 'scenario-row--pending': row.pending }"
					:data-scenario-input="row.key">
					<td style="width: 45%">
						<div class="scenario-name">{{ row.label }}</div>
						<div class="text-caption text-medium-emphasis">
							line{{ row.input.lines.length === 1 ? "" : "s" }} {{ row.linesText }}
							<v-chip v-if="row.pending" size="x-small" color="warning" class="ml-1">needs a value</v-chip>
							<v-chip v-if="row.input.known === false" size="x-small" color="error" class="ml-1"
									title="Not a known object-model path at this RRF version">unknown path</v-chip>
						</div>
					</td>
					<td>
						<span v-if="row.input.dynamic" class="text-caption text-medium-emphasis">
							Index is computed - you'll be asked for each value when the run reaches it.
						</span>
						<ScenarioValueField v-else :model-value="row.text" :placeholder="row.placeholder"
											:aria-label="`Value of ${row.label}`" :clearable="true"
											@commit="(text: string) => commitValue(row.input.kind, row.input.name, text)" />
					</td>
				</tr>
			</tbody>
		</v-table>
		<div v-else class="text-caption font-italic mb-2">This file doesn't read any object-model values, arguments or undeclared globals.</div>

		<template v-if="otherValues.length > 0">
			<div class="text-caption text-medium-emphasis mb-1">Other values set for this file</div>
			<div class="d-flex flex-wrap ga-1 mb-2">
				<v-chip v-for="o in otherValues" :key="o.key" size="small" closable
						:title="'Click × to forget this value'" @click:close="emit('update:inputs', withInputValue(inputs, o.kind, o.name, undefined))">
					{{ o.label }} = {{ o.text }}
				</v-chip>
			</div>
		</template>

		<div class="d-flex flex-wrap ga-2 align-center">
			<!-- Plain fields, not ScenarioValueField: nothing here re-runs the walk until Add is pressed, and a
			     commit-on-blur field would race the Add button's own enabled state. -->
			<v-text-field v-model="newName" density="compact" hide-details variant="outlined" style="width: 16rem"
						  label="Add a path" placeholder="e.g. heat.heaters[1].current" aria-label="Path to add"
						  spellcheck="false" autocomplete="off" @keyup.enter="addManual" />
			<v-text-field v-model="newValue" density="compact" hide-details variant="outlined" style="width: 10rem"
						  label="Value" placeholder="e.g. 200" aria-label="Value for the added path"
						  spellcheck="false" autocomplete="off" @keyup.enter="addManual" />
			<v-btn size="small" variant="tonal" :disabled="newName.trim() === '' || newValue.trim() === ''" @click="addManual">Add</v-btn>
			<v-spacer />
			<v-btn size="small" variant="text" prepend-icon="mdi-refresh" :disabled="isEmptySimulationInputs(inputs)"
				   @click="emit('update:inputs', emptySimulationInputs())">Clear everything</v-btn>
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
	return {
		key: keyOf(input.kind, input.name),
		input,
		label: labelOf(input.kind, input.name),
		linesText: input.lines.map((l) => l + 1).join(", "),
		text: current === undefined ? "" : formatEvalValue(current),
		placeholder: input.kind === "global" ? "not defined" : "not set",
		pending: props.pendingPath !== null && input.name === props.pendingPath,
	};
}));

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

function commitValue(kind: ReferencedInputKind, name: string, text: string): void {
	const t = text.trim();
	emit("update:inputs", withInputValue(props.inputs, kind, name, t === "" ? undefined : parseSimulatedValueInput(t)));
}

const newName = ref("");
const newValue = ref("");
function addManual(): void {
	const name = newName.value.trim();
	const value = newValue.value.trim();
	if (name === "" || value === "") return;
	emit("update:inputs", withInputValue(props.inputs, name.startsWith("param.") ? "param" : "objectModel", name, parseSimulatedValueInput(value)));
	newName.value = "";
	newValue.value = "";
}
</script>
