<template>
	<v-alert v-if="axes.length" type="warning" density="compact" variant="tonal" class="uhw-alert">
		{{ $t("plugins.flexibleLayouts.homedCheck.notHomed", { axes: axes.join(", ") }) }}
	</v-alert>
</template>

<script setup lang="ts">
defineProps<{ axes: Array<string> }>();
</script>

<style scoped>
.uhw-alert { font-size: 0.8em; }
</style>
