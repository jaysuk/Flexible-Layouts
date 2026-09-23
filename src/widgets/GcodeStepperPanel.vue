<style scoped>
.stepper-state {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
}
</style>

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

		<div v-if="simulatedValues.length > 0" class="d-flex align-center ga-1 flex-wrap mt-1">
			<span class="text-caption text-medium-emphasis">Simulated:</span>
			<v-chip v-for="sv in simulatedValues" :key="sv.path" size="x-small" closable
					title="Click × to forget this simulated value" @click:close="emit('remove-simulated-value', sv.path)">
				{{ sv.path }} = {{ sv.display }}
			</v-chip>
			<v-btn icon="mdi-refresh" size="x-small" variant="text" title="Clear all simulated values"
				   @click="emit('reset-simulated-values')" />
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

		<div class="stepper-state text-caption text-medium-emphasis mt-1">
			<template v-if="state !== null">
				<span v-if="state.layer >= 0">Layer {{ state.layer }}</span>
				<span v-if="state.x !== null">X{{ state.x.toFixed(2) }}</span>
				<span v-if="state.y !== null">Y{{ state.y.toFixed(2) }}</span>
				<span v-if="state.z !== null">Z{{ state.z.toFixed(2) }}</span>
				<span v-if="state.e !== null">E{{ state.e.toFixed(3) }}</span>
				<span v-if="state.tool >= 0">Tool {{ state.tool }}</span>
				<span v-if="state.feedrate !== null">F{{ state.feedrate }}</span>
				<span v-if="state.relativeMoves">G91 (relative)</span>
				<span v-if="state.object !== null">Object {{ state.object }}</span>
				<span v-if="state.featureType !== null">{{ state.featureType }}</span>
			</template>
			<span v-else class="font-italic">No state derived yet at this step.</span>
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
	</div>
</template>

<script setup lang="ts">
/**
 * Purely presentational: the offline stepper's scrub bar + step buttons + a readout of the machine
 * state {@link MachineState} derives at the current EXECUTION STEP (not physical line — a false
 * `if`/`while` branch contributes no steps, a loop body contributes one step per iteration; see
 * `executionIndex.ts`), plus two kinds of "paused, need input" prompt — an unresolved object-model
 * path, or an unanswered blocking `M291` message box, rendered with the buttons/input the real box
 * would show (OK / OK+Cancel / a bounds-checked value field) — and the lists of simulated values and
 * message-box answers currently in effect, each individually removable. Owns no state of its own
 * beyond the slider's live drag value and the two prompts' input fields — `GcodeEditor.vue` (the
 * wiring layer) supplies everything else and applies the various `update:currentStep`/`resolve-path`/
 * `resolve-message-box`/`remove-*`/`reset-*` emits back to its own source of truth.
 */
import { computed, ref, watch } from "vue";
import type { MessageBoxAnswer, MessageBoxPrompt } from "dwc-gcode-core";
import type { MachineState } from "dwc-gcode-core/stepper/machineState";

const props = defineProps<{
	currentStep: number;
	totalSteps: number;
	/** 1-based physical line the current step executes, for display and editor highlighting — null
	 *  when there's no step to show yet (e.g. an empty file, or paused before any step completed). */
	line: number | null;
	state: MachineState | null;
	status: "complete" | "paused" | "message-box" | "error";
	pendingPath: string | null;
	messageBoxPrompt: MessageBoxPrompt | null;
	errorMessage: string | null;
	/** Every simulated value currently in effect, `display` already formatted for read-only display —
	 *  this component stays free of `dwc-gcode-core`'s `EvalValue` formatting concerns. */
	simulatedValues: ReadonlyArray<{ path: string; display: string }>;
	/** Every remembered message-box answer, `key` the opaque content-key `GcodeEditor.vue` uses to
	 *  remove it again, `display` already formatted for read-only display. */
	messageBoxAnswers: ReadonlyArray<{ key: string; display: string }>;
}>();
const emit = defineEmits<{
	"update:currentStep": [number];
	"resolve-path": [path: string, rawValue: string];
	"remove-simulated-value": [path: string];
	"reset-simulated-values": [];
	"resolve-message-box": [answer: MessageBoxAnswer];
	"remove-message-box-answer": [key: string];
	"reset-message-box-answers": [];
}>();

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
