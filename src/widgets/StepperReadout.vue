<style scoped>
.mono {
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
}
.now {
	border-left: 3px solid rgb(var(--v-theme-primary));
	padding: 0.25rem 0.75rem;
	background: rgba(var(--v-theme-primary), 0.06);
}
.now-code {
	white-space: pre-wrap;
	word-break: break-all;
	font-size: 0.875rem;
}
.now-evaluated .value {
	font-weight: 700;
	color: rgb(var(--v-theme-primary));
}
.now-evaluated .result {
	font-style: italic;
	color: rgb(var(--v-theme-primary));
}
.axes {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
	gap: 0.5rem;
}
.axis-card {
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 6px;
	padding: 0.25rem 0.625rem;
	min-height: 4.25rem;
}
.axis-card--changed {
	border-color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.08);
}
.axis-letter {
	font-size: 0.75rem;
	font-weight: 600;
	opacity: 0.75;
}
.axis-value {
	font-size: 1.375rem;
	font-weight: 600;
	line-height: 1.3;
}
.axis-delta {
	font-size: 0.75rem;
	min-height: 1.1em;
	opacity: 0.85;
}
.axis-unknown {
	opacity: 0.4;
}
.var-changed {
	background: rgba(var(--v-theme-primary), 0.1);
	font-weight: 600;
}
</style>

<template>
	<div v-if="view !== null" class="stepper-readout">
		<div class="now mb-2" data-readout="line">
			<div class="text-caption text-medium-emphasis">
				Line {{ view.line }}<template v-if="view.iteration !== null"> · loop iteration {{ view.iteration }}</template>
			</div>
			<div class="now-code mono" data-readout="source">{{ view.source === "" ? " " : view.source }}</div>
			<div v-if="view.evaluated.changed" class="now-code now-evaluated mono" data-readout="evaluated"
				 aria-label="Line as evaluated"><span v-for="(seg, i) in view.evaluated.segments" :key="i" :class="seg.kind">{{ seg.text }}</span></div>
		</div>

		<div class="axes mb-2" data-readout="axes">
			<div v-for="a in view.axes" :key="a.letter" class="axis-card" :class="{ 'axis-card--changed': a.changed }"
				 :data-axis="a.letter" :title="a.previous === null ? undefined : `was ${fixed(a.previous)}`">
				<div class="axis-letter">
					{{ a.letter }}
					<v-icon v-if="a.homed" size="x-small" title="Homed" aria-label="Homed">mdi-home</v-icon>
				</div>
				<div class="axis-value mono" :class="{ 'axis-unknown': a.position === null }">{{ a.position === null ? "—" : fixed(a.position) }}</div>
				<div class="axis-delta mono">{{ a.delta !== null && a.delta !== 0 ? signed(a.delta) : "" }}</div>
			</div>
			<div class="axis-card" :class="{ 'axis-card--changed': extruderChanged }" data-axis="E">
				<div class="axis-letter">E</div>
				<div class="axis-value mono" :class="{ 'axis-unknown': view.state.e === null }">{{ view.state.e === null ? "—" : fixed(view.state.e) }}</div>
				<div class="axis-delta mono">{{ extruderDelta === null ? "" : signed(extruderDelta) }}</div>
			</div>
		</div>

		<div class="d-flex flex-wrap ga-2 mb-2 text-caption mono" data-readout="modes">
			<span v-if="view.state.layer >= 0">Layer {{ view.state.layer }}</span>
			<span v-if="view.state.tool >= 0">Tool {{ view.state.tool }}</span>
			<span v-if="view.state.feedrate !== null">F{{ view.state.feedrate }}</span>
			<span v-if="view.state.relativeMoves">G91 (relative)</span>
			<span v-if="view.state.relativeE">M83 (relative E)</span>
			<span v-if="view.state.object !== null">Object {{ view.state.object }}</span>
			<span v-if="view.state.featureType !== null">{{ view.state.featureType }}</span>
		</div>

		<template v-if="variableRows.length > 0 || removed.length > 0">
			<v-table density="compact" class="mb-1" data-readout="variables">
				<thead>
					<tr><th>Variable</th><th>Value</th><th style="width: 30%"></th></tr>
				</thead>
				<tbody>
					<tr v-for="row in variableRows" :key="row.key" :class="{ 'var-changed': row.change !== null }" :data-variable="row.key">
						<td class="mono">{{ row.key }}</td>
						<td class="mono">{{ row.text }}</td>
						<td class="text-caption">
							<template v-if="row.change === 'added'">new</template>
							<template v-else-if="row.change === 'changed'">was {{ row.previousText }}</template>
						</td>
					</tr>
				</tbody>
			</v-table>
			<div v-if="removed.length > 0" class="text-caption text-medium-emphasis mb-1">
				Out of scope after this step: {{ removed.join(", ") }}
			</div>
		</template>
	</div>
	<div v-else class="text-caption font-italic">No state derived yet at this step.</div>
</template>

<script setup lang="ts">
/**
 * What the offline stepper shows for the current step, all derived by `describeStep` in
 * `dwc-gcode-core/stepper/simulation` - this component only lays it out: the source line with the line
 * AS EVALUATED beneath it, every axis's position large with how far it just moved, the modal state
 * (tool, feedrate, G91/M83, layer), and the `var`/`global` values with what this step changed.
 */
import { computed } from "vue";
import type { EvalValue } from "dwc-gcode-core";
import { formatEvalValue, type StepView } from "dwc-gcode-core/stepper/simulation";

const props = defineProps<{ view: StepView | null }>();

const fixed = (n: number): string => n.toFixed(3);
const signed = (n: number): string => `${n > 0 ? "+" : "-"}${Math.abs(n).toFixed(3)}`;

const extruderDelta = computed(() => {
	const v = props.view;
	if (v === null || v.state.e === null || v.previousState.e === null) return null;
	const d = v.state.e - v.previousState.e;
	return d === 0 ? null : d;
});
const extruderChanged = computed(() => props.view !== null && props.view.state.e !== props.view.previousState.e);

const variableRows = computed(() => {
	const v = props.view;
	if (v === null) return [];
	const changes = new Map(v.variableChanges.map((c) => [`${c.scope}.${c.name}`, c]));
	const rows: Array<{ key: string; text: string; change: "added" | "changed" | null; previousText: string }> = [];
	const add = (scope: "var" | "global", map: ReadonlyMap<string, EvalValue>): void => {
		for (const [name, value] of map) {
			const key = `${scope}.${name}`;
			const c = changes.get(key);
			rows.push({
				key,
				text: formatEvalValue(value),
				change: c === undefined || c.change === "removed" ? null : c.change,
				previousText: c?.previous === undefined ? "" : formatEvalValue(c.previous),
			});
		}
	};
	add("var", v.variables.local);
	add("global", v.variables.global);
	return rows;
});

const removed = computed(() => (props.view?.variableChanges ?? []).filter((c) => c.change === "removed").map((c) => `${c.scope}.${c.name}`));
</script>
