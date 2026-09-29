<template>
	<div>
		<div class="d-flex align-center ga-2">
			<v-btn icon="mdi-skip-previous" size="small" variant="text" :disabled="currentStep <= 0"
				   title="Step back" @click="emit('update:currentStep', currentStep - 1)" />
			<v-slider :model-value="currentStep" :min="0" :max="Math.max(0, totalSteps - 1)" :step="1" hide-details
					  density="compact" class="flex-grow-1"
					  @update:model-value="(v: number) => emit('update:currentStep', Math.round(v))" />
			<v-btn icon="mdi-skip-next" size="small" variant="text" :disabled="currentStep >= totalSteps - 1"
				   title="Step forward" @click="emit('update:currentStep', currentStep + 1)" />
			<span class="text-caption text-medium-emphasis" style="min-width: 9rem; text-align: right">
				Step {{ totalSteps === 0 ? 0 : currentStep + 1 }} / {{ totalSteps }}<template v-if="line !== null"> (line {{ line }})</template>
			</span>
		</div>

		<div v-if="messageBoxAnswers.length > 0" class="d-flex align-center ga-1 flex-wrap mt-1">
			<span class="text-caption text-medium-emphasis">Message box answers:</span>
			<v-chip v-for="mb in messageBoxAnswers" :key="mb.key" size="x-small" closable
					title="Click × to forget this answer" @click:close="emit('remove-message-box-answer', mb.key)">
				{{ mb.display }}
			</v-chip>
			<v-btn icon="mdi-refresh" size="x-small" variant="text" title="Clear all message box answers"
				   @click="emit('reset-message-box-answers')" />
		</div>

		<v-alert v-if="status === 'paused' && pendingPath !== null" type="warning" variant="tonal" density="compact" class="mt-2">
			<div class="d-flex align-center ga-2 flex-wrap">
				<span>Execution depends on <code>{{ pendingPath }}</code>, which has no known value offline — what should the simulation use?</span>
				<v-text-field v-model="promptValue" density="compact" hide-details variant="outlined" style="max-width: 10rem"
							  placeholder="e.g. 1, true, ..." @keyup.enter="submitPrompt" />
				<v-btn size="small" color="warning" variant="tonal" :disabled="promptValue.trim() === ''" @click="submitPrompt">Apply</v-btn>
			</div>
		</v-alert>

		<v-alert v-else-if="status === 'message-box' && messageBoxPrompt !== null" type="warning" variant="tonal" density="compact" class="mt-2">
			<div class="d-flex flex-column ga-2">
				<div>
					<div v-if="messageBoxPrompt.title !== null" class="font-weight-bold">{{ messageBoxPrompt.title }}</div>
					<div>{{ messageBoxPrompt.message }}</div>
				</div>
				<div v-if="messageBoxPrompt.mode === 'ok'" class="d-flex ga-2">
					<v-btn size="small" color="warning" variant="tonal" @click="emit('resolve-message-box', { input: null, cancelled: false })">OK</v-btn>
				</div>
				<div v-else-if="messageBoxPrompt.mode === 'okCancel'" class="d-flex ga-2">
					<v-btn size="small" color="warning" variant="tonal" @click="emit('resolve-message-box', { input: null, cancelled: false })">OK</v-btn>
					<v-btn size="small" variant="text" @click="emit('resolve-message-box', { input: null, cancelled: true })">Cancel</v-btn>
				</div>
				<div v-else-if="messageBoxPrompt.mode === 'choice'" class="d-flex ga-2 flex-wrap">
					<v-btn v-for="(choice, i) in messageBoxPrompt.choices" :key="i" size="small"
						   :color="i === messageBoxPrompt.defaultIndex ? 'warning' : undefined"
						   :variant="i === messageBoxPrompt.defaultIndex ? 'tonal' : 'outlined'"
						   @click="emit('resolve-message-box', { input: i, cancelled: false })">
						{{ choice }}
					</v-btn>
				</div>
				<div v-else class="d-flex align-center ga-2">
					<v-text-field v-model="messageBoxValue" density="compact" hide-details variant="outlined" style="max-width: 12rem"
								  :placeholder="messageBoxPlaceholder" @keyup.enter="submitMessageBoxValue" />
					<v-btn size="small" color="warning" variant="tonal" :disabled="!messageBoxValueValid" @click="submitMessageBoxValue">Submit</v-btn>
				</div>
			</div>
		</v-alert>

		<v-alert v-else-if="status === 'error' && errorMessage !== null" type="error" variant="tonal" density="compact" class="mt-2">
			{{ errorMessage }}
		</v-alert>

		<StepperReadout :view="view" class="mt-1" />

		<v-expansion-panels v-model="scenarioPanelOpen" variant="accordion" class="mt-1 stepper-scenario-panels">
			<v-expansion-panel :title="scenarioPanelTitle" data-scenario-panel>
				<v-expansion-panel-text>
					<StepperScenarioPanel :inputs="inputs" :referenced="referenced" :pending-path="status === 'paused' ? pendingPath : null"
										  :scenario-names="scenarioNames" :active-scenario="activeScenario" :cursor-line="cursorLine"
										  @update:inputs="(next: SimulationInputs) => emit('update:inputs', next)"
										  @select-scenario="(name: string) => emit('select-scenario', name)"
										  @add-scenario="(name: string) => emit('add-scenario', name)"
										  @duplicate-scenario="emit('duplicate-scenario')"
										  @rename-scenario="(name: string) => emit('rename-scenario', name)"
										  @delete-scenario="emit('delete-scenario')" />
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>
	</div>
</template>

<style scoped>
/* Vuetify's own expansion-panel-title/text padding is sized for a standalone accordion, not a
   collapsed-by-default strip under an already-dense readout - trimmed so the closed "Scenario" row
   costs one compact line, not a full-height list item. */
.stepper-scenario-panels :deep(.v-expansion-panel-title) {
	min-height: 2.25rem;
	padding: 0.375rem 1rem;
}
.stepper-scenario-panels :deep(.v-expansion-panel-text__wrapper) {
	padding: 0.5rem 1rem 0.75rem;
}
</style>

<script setup lang="ts">
/**
 * The offline stepper for system files and macros: scrub bar + step buttons, what the current step DID
 * (`StepperReadout` - the line as evaluated, every axis's position and how far it moved, the variables),
 * the scenario editor (`StepperScenarioPanel` - the file's named scenarios, starting position and start
 * line, the endstops a `G1 H1` homing move meets, and the object-model / `param.*` / global values to
 * test with; it opens itself when the walk pauses on a value it has a field for), and two kinds of
 * "paused, need input" prompt: an unresolved path, or an
 * unanswered blocking `M291` message box, rendered with the buttons/input the real box would show
 * (OK / OK+Cancel / a bounds-checked value field). Steps are EXECUTION steps, not physical lines - a
 * false `if`/`while` branch contributes none, a loop body one per iteration (`executionIndex.ts`).
 * Owns no state beyond the slider's drag value and the two prompts' input fields - `GcodeEditor.vue`
 * (the wiring layer) supplies everything else and applies the emits back to its own source of truth.
 */
import { computed, ref, watch } from "vue";
import type { MessageBoxAnswer, MessageBoxPrompt } from "dwc-gcode-core";
import type { ReferencedInput, SimulationInputs, StepView } from "dwc-gcode-core/stepper/simulation";

import StepperReadout from "./StepperReadout.vue";
import StepperScenarioPanel from "./StepperScenarioPanel.vue";

const props = defineProps<{
	currentStep: number;
	totalSteps: number;
	/** 1-based physical line the current step executes, for display and editor highlighting — null
	 *  when there's no step to show yet (e.g. an empty file, or paused before any step completed). */
	line: number | null;
	/** Everything to show about the current step (`describeStep`) - null before there is one. */
	view: StepView | null;
	status: "complete" | "paused" | "message-box" | "error";
	pendingPath: string | null;
	messageBoxPrompt: MessageBoxPrompt | null;
	errorMessage: string | null;
	/** The scenario being run, and what the file reads (`findReferencedInputs`) to offer values for. */
	inputs: SimulationInputs;
	referenced: ReadonlyArray<ReferencedInput>;
	/** Every remembered message-box answer, `key` the opaque content-key `GcodeEditor.vue` uses to
	 *  remove it again, `display` already formatted for read-only display. */
	messageBoxAnswers: ReadonlyArray<{ key: string; display: string }>;
	/** The file's named scenarios and which is active (`dwc-gcode-core/stepper/scenarioSet`), and the
	 *  1-based line the editor cursor is on (null when unknown) for the "start here" button. */
	scenarioNames: ReadonlyArray<string>;
	activeScenario: string;
	cursorLine: number | null;
}>();
const emit = defineEmits<{
	"update:currentStep": [number];
	"update:inputs": [SimulationInputs];
	"select-scenario": [name: string];
	"add-scenario": [name: string];
	"duplicate-scenario": [];
	"rename-scenario": [name: string];
	"delete-scenario": [];
	"resolve-path": [path: string, rawValue: string];
	"resolve-message-box": [answer: MessageBoxAnswer];
	"remove-message-box-answer": [key: string];
	"reset-message-box-answers": [];
}>();

// The Scenario accordion: the panel's own model, so it can open itself. The title carries the active
// scenario's name once a file has more than one, so a collapsed panel still says which one is running.
const scenarioPanelOpen = ref<number | undefined>(undefined);
const scenarioPanelTitle = computed(() => (props.scenarioNames.length > 1 ? `Scenario: ${props.activeScenario}` : "Scenario"));

// When the walk stops on a value the scenario has a field for, open the scenario panel - it is where
// that value is entered, and otherwise the alert above is easy to read and the accordion below easy to
// miss. Only on a NEW pause: someone who collapses it again keeps it collapsed while they work on the
// same path, and a path the panel has no field for (a computed index) is left to the alert's own input.
watch(() => (props.status === "paused" ? props.pendingPath : null), (path) => {
	if (path !== null && props.referenced.some((r) => r.name === path && !r.dynamic)) scenarioPanelOpen.value = 0;
}, { immediate: true });

const promptValue = ref("");
watch(() => props.pendingPath, () => { promptValue.value = ""; });

function submitPrompt(): void {
	if (props.pendingPath === null || promptValue.value.trim() === "") return;
	emit("resolve-path", props.pendingPath, promptValue.value);
}

const messageBoxValue = ref("");
watch(() => props.messageBoxPrompt, (prompt) => {
	messageBoxValue.value = (prompt !== null && "defaultValue" in prompt && prompt.defaultValue !== null)
		? String(prompt.defaultValue)
		: "";
});

const messageBoxPlaceholder = computed(() => {
	const prompt = props.messageBoxPrompt;
	if (prompt === null || prompt.mode === "ok" || prompt.mode === "okCancel" || prompt.mode === "choice") return "";
	if (prompt.mode === "string") return "text";
	const bounds = [prompt.min !== null ? `min ${prompt.min}` : null, prompt.max !== null ? `max ${prompt.max}` : null]
		.filter((b) => b !== null).join(", ");
	return bounds === "" ? "number" : `number (${bounds})`;
});

/** Validates the typed value against the current prompt's own mode and limits — RRF itself rejects an
 *  out-of-range or wrongly-typed M291 value the same way (`MessageBoxLimits`'s own bounds checks). */
const messageBoxValueValid = computed(() => {
	const prompt = props.messageBoxPrompt;
	if (prompt === null) return false;
	const text = messageBoxValue.value.trim();
	if (prompt.mode === "integer" || prompt.mode === "float") {
		if (text === "") return false;
		const n = Number(text);
		if (!Number.isFinite(n)) return false;
		if (prompt.mode === "integer" && !Number.isInteger(n)) return false;
		if (prompt.min !== null && n < prompt.min) return false;
		if (prompt.max !== null && n > prompt.max) return false;
		return true;
	}
	if (prompt.mode === "string") {
		if (prompt.minLength !== null && text.length < prompt.minLength) return false;
		if (prompt.maxLength !== null && text.length > prompt.maxLength) return false;
		return true;
	}
	return false; // "ok"/"okCancel" submit via their own buttons, not this field
});

function submitMessageBoxValue(): void {
	const prompt = props.messageBoxPrompt;
	if (prompt === null || !messageBoxValueValid.value || (prompt.mode !== "integer" && prompt.mode !== "float" && prompt.mode !== "string")) return;
	const text = messageBoxValue.value.trim();
	const input = prompt.mode === "string" ? text : Number(text);
	emit("resolve-message-box", { input, cancelled: false });
}
</script>
