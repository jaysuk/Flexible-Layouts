<template>
	<CodeInput class="fl-code-input" />
</template>

<script setup lang="ts">
import type { Widget } from "../model/document";

defineProps<{ widget: Extract<Widget, { type: "codeInput" }> }>();
</script>

<style scoped>
.fl-code-input {
	width: 100%;
}
</style>
