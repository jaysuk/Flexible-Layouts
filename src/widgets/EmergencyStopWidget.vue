<template>
	<div v-if="visible" class="fill-height d-flex align-center">
		<EmergencyButton large />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";
import { currentLevel, getAccess } from "../model/access";

defineProps<{ widget: Extract<Widget, { type: "emergencyStop" }> }>();

// Same rule as the top-bar button (FlexShell): an Observer whose access config hides the e-stop doesn't get it here either.
const visible = computed(() => !(currentLevel() === "observer" && getAccess().hideEmergencyStop));
</script>
