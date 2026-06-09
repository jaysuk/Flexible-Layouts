<template>
	<!-- Stock Console page content: code input + the event/console log -->
	<div class="fb-console fill-height d-flex flex-column pa-2">
		<component :is="codeInput" variant="solo" class="flex-shrink-0 mb-2" />
		<component :is="eventList" class="fb-grow" />
	</div>
</template>

<script setup lang="ts">
import { resolveComponent } from "vue";

// Globally-registered DWC components, resolved by name so this plugin doesn't bundle DWC code.
const codeInput = resolveComponent("CodeInput");
const eventList = resolveComponent("EventList");
</script>

<style scoped>
.fb-console { min-height: 0; }
.fb-grow { flex: 1 1 auto; min-height: 0; overflow: auto; }
</style>
