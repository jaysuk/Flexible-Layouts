<template>
	<!-- A single v-select so existing width/column styling is preserved. Theme tokens + any named
		 theme colours + a "Custom…" entry that reveals a native colour picker for an arbitrary value. -->
	<v-select :model-value="selectValue" :items="items" v-bind="$attrs"
			  @update:model-value="onSelect">
		<template #prepend-inner>
			<span class="flex-color-chip" :style="{ background: swatch }" />
		</template>
		<template v-if="showPicker" #append-inner>
			<input type="color" class="flex-color-pick" :value="hexValue" :title="customLabel"
				   @click.stop @mousedown.stop @input="onPick" />
		</template>
	</v-select>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import { useLayoutStore } from "../model/store";
import { isCssColor, resolveColor } from "../util/color";

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ "update:modelValue": [string | undefined] }>();

defineOptions({ inheritAttrs: false });

const CUSTOM = "__custom__";
const store = useLayoutStore();
const t = (k: string) => i18n.global.t(`plugins.flexibleLayouts.${k}`);

// Built-in theme tokens + any user-defined named colours (stored as their literal value so they keep
// working regardless of whether the global theme is enabled — see model/theme.ts).
const items = computed(() => {
	const base: Array<{ title: string; value: string | undefined }> = [
		{ title: t("colors.default"), value: undefined },
		{ title: t("colors.primary"), value: "primary" },
		{ title: t("colors.secondary"), value: "secondary" },
		{ title: t("colors.success"), value: "success" },
		{ title: t("colors.info"), value: "info" },
		{ title: t("colors.warning"), value: "warning" },
		{ title: t("colors.error"), value: "error" },
	];
	for (const c of store.document.value.theme.customColors ?? []) {
		if (c?.name && c?.value) {
			base.push({ title: c.name, value: c.value });
		}
	}
	base.push({ title: t("colors.custom"), value: CUSTOM });
	return base;
});

const known = computed(() => new Set(items.value.map((i) => i.value)));

// Show the matching item when the value is a known token/named colour; otherwise treat it as a free
// custom colour (the picker reveals below).
const selectValue = computed<string | undefined>(() => {
	const v = props.modelValue;
	if (v == null || v === "") {
		return undefined;
	}
	return known.value.has(v) ? v : CUSTOM;
});

const showPicker = computed(() => !!props.modelValue && isCssColor(props.modelValue));
const hexValue = computed(() => (props.modelValue && /^#[0-9a-f]{3,8}$/i.test(props.modelValue) ? props.modelValue : "#888888"));
const swatch = computed(() => (props.modelValue ? resolveColor(props.modelValue) : "transparent"));
const customLabel = computed(() => t("colors.custom"));

function onSelect(v: string | undefined): void {
	if (v === CUSTOM) {
		// Switch into custom mode, seeding from the current colour if it's already a literal value.
		emit("update:modelValue", props.modelValue && isCssColor(props.modelValue) ? props.modelValue : "#888888");
	} else {
		emit("update:modelValue", v);
	}
}

function onPick(ev: Event): void {
	emit("update:modelValue", (ev.target as HTMLInputElement).value);
}
</script>

<style scoped>
.flex-color-chip {
	display: inline-block;
	width: 16px;
	height: 16px;
	border-radius: 3px;
	border: 1px solid rgba(var(--v-border-color), 0.4);
	margin-right: 2px;
}
.flex-color-pick {
	width: 26px;
	height: 22px;
	border: 1px solid rgba(var(--v-border-color), 0.4);
	border-radius: 4px;
	background: none;
	cursor: pointer;
	padding: 0;
	align-self: center;
}
</style>
