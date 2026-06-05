<template>
	<v-container fluid class="pa-2">
		<FFFContainerPanel v-if="uiStore.isFFF" />
		<CNCContainerPanel v-else />
	</v-container>
</template>

<script setup lang="ts">
// The stock persistent status region (Status / Tools / Temperatures), shown until the user
// customises the status bar. Rendered as literal tags so the panels resolve in both load paths.
import { useUiStore } from "@/stores/ui";

const uiStore = useUiStore();
</script>
