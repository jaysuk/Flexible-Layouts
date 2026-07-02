<template>
	<div class="fill-height d-flex align-center">
		<UploadButton />
	</div>
</template>

<script setup lang="ts">
import type { Widget } from "../model/document";

defineProps<{ widget: Extract<Widget, { type: "uploadButton" }> }>();
</script>
