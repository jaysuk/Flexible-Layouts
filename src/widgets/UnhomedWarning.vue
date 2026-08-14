<template>
	<v-alert v-if="axes.length" type="warning" density="compact" variant="tonal" class="uhw-alert">
		{{ $t("plugins.flexibleLayouts.homedCheck.notHomed", { axes: axes.join(", ") }) }}
	</v-alert>
</template>

<script setup lang="ts">
defineProps<{ axes: Array<string> }>();
</script>

<style scoped>
/* Vuetify's own .v-alert sets `flex: 1 1` (flex-basis: 0%) - inside a fixed-height flex-column
   parent (see JogWidget/OctopusJogWidget's `.jog-root`/`.oct-root`) that puts this alert in a
   flex-grow contest against its much bigger sibling for whatever space is left over, which on a
   freshly-dropped (not yet resized) panel is often almost nothing - the alert collapses to a
   sliver, showing only its rounded corner. Forcing it back to content-sized (like every other
   sibling here) fixes that regardless of how tall the panel happens to be. */
.uhw-alert { font-size: 0.8em; flex: none; }
</style>
