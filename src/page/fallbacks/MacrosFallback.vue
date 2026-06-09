<template>
	<!-- Stock Macros page content -->
	<div class="fb-macros fill-height">
		<component :is="macroList" />
	</div>
</template>

<script setup lang="ts">
import { resolveComponent } from "vue";

const macroList = resolveComponent("MacroList");
</script>

<style scoped>
.fb-macros { min-height: 0; }
</style>
