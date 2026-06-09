<template>
	<!-- Stock Temperatures page content: the temperature graph -->
	<div class="fb-temps fill-height pa-2">
		<component :is="chart" />
	</div>
</template>

<script setup lang="ts">
import { resolveComponent } from "vue";

const chart = resolveComponent("TemperatureChart");
</script>

<style scoped>
.fb-temps { min-height: 0; }
</style>
