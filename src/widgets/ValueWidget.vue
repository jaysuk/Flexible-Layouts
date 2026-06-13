<template>
	<div class="fill-height d-flex flex-column align-center justify-center text-center pa-2">
		<template v-if="!widget.omPath">
			<v-icon color="medium-emphasis">mdi-counter</v-icon>
			<div class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.widgets.valueUnset") }}
			</div>
		</template>

		<template v-else-if="widget.display === 'gauge'">
			<v-progress-circular :model-value="gaugePct" :size="76" :width="9"
								 :color="effectiveColor || 'primary'">
				<span class="text-body-2">{{ formatted }}</span>
			</v-progress-circular>
			<div v-if="widget.label" class="text-caption text-medium-emphasis mt-1">{{ widget.label }}</div>
		</template>

		<template v-else-if="widget.display === 'label'">
			<div>
				<span v-if="widget.label" class="text-medium-emphasis me-1">{{ widget.label }}:</span>
				<span class="font-weight-medium" :style="valueStyle">{{ formatted }}{{ unitSuffix }}</span>
			</div>
		</template>

		<template v-else>
			<div class="font-weight-medium" :style="[valueStyle, { fontSize: '2em', lineHeight: 1.1 }]">
				{{ formatted }}<span style="font-size: 0.6em">{{ unitSuffix }}</span>
			</div>
			<div v-if="widget.label" class="text-medium-emphasis" style="font-size: 0.8em">{{ widget.label }}</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { evalMathExpr } from "../util/mathExpr";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "value" }>; overrideColor?: string }>();

const machineStore = useMachineStore();

const effectiveColor = computed(() => props.overrideColor || props.widget.color);

// Reactive: machineStore.model is a Pinia-tracked proxy, so re-resolving the path inside a
// computed re-runs whenever the underlying field changes.
const raw = computed(() => resolveOmPath(machineStore.model, props.widget.omPath));

/** Numeric value after scale/offset and the optional expression, used for read-out and gauge. */
const numericValue = computed(() => {
	const v = raw.value;
	if (typeof v !== "number" || !Number.isFinite(v)) {
		return undefined;
	}
	const w = props.widget;
	const linear = (w.scale !== undefined || w.offset !== undefined) ? v * (w.scale ?? 1) + (w.offset ?? 0) : v;
	return w.expression ? evalMathExpr(w.expression, linear) : linear;
});

const formatted = computed(() => {
	const w = props.widget;
	const v = raw.value;
	if (v === undefined || v === null) {
		return "—";
	}
	// Exact value -> text mapping (matches the raw or transformed value as a string).
	if (w.map && w.map.length > 0) {
		const asStr = String(v);
		const num = numericValue.value;
		const m = w.map.find((x) => x.value === asStr || (num !== undefined && x.value === String(num)));
		if (m) {
			return m.text;
		}
	}
	// Boolean / 0-1 -> on/off text.
	if (w.boolOn !== undefined || w.boolOff !== undefined) {
		const truthy = v !== 0 && v !== "0" && v !== false && v !== "false" && v !== "" && v !== null;
		return truthy ? (w.boolOn ?? "On") : (w.boolOff ?? "Off");
	}
	const num = numericValue.value;
	if (num !== undefined) {
		return num.toFixed(w.precision ?? 1);
	}
	if (typeof v === "boolean") {
		return v ? "on" : "off";
	}
	return String(v);
});

const unitSuffix = computed(() => (props.widget.unit ? ` ${props.widget.unit}` : ""));

const valueStyle = computed(() =>
	effectiveColor.value ? { color: resolveColor(effectiveColor.value) } : {});

const gaugePct = computed(() => {
	const v = numericValue.value;
	if (v === undefined) {
		return 0;
	}
	const min = props.widget.min ?? 0;
	const max = props.widget.max ?? 100;
	if (max === min) {
		return 0;
	}
	return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
});
</script>
