<!--
	Small inline help affordance: a low-emphasis “?” icon that shows an explanatory tooltip box on
	hover/focus. Used across the editor UI so every setting can explain itself without permanently
	taking up space with a hint line. `v-tooltip`/`v-icon` are globally registered Vuetify components
	(DWC app), so they're used bare here like the rest of FL's templates.
-->
<template>
	<v-tooltip :text="text" location="top" max-width="320" open-delay="200">
		<template #activator="{ props: tip }">
			<v-icon v-bind="tip" :size="size" class="flex-help-tip" tabindex="0"
					:aria-label="text">mdi-help-circle-outline</v-icon>
		</template>
	</v-tooltip>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	/** The explanation shown in the tooltip box. */
	text: string;
	/** Icon size; defaults to a compact "x-small" to sit unobtrusively beside labels/fields. */
	size?: string | number;
}>(), { size: "x-small" });
</script>

<style scoped>
.flex-help-tip {
	opacity: 0.55;
	cursor: help;
	vertical-align: middle;
}
.flex-help-tip:hover,
.flex-help-tip:focus-visible {
	opacity: 1;
}
</style>
