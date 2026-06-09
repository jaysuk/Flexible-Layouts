<template>
	<!-- Stock Explorer page content = the file-explorer widget rooted at the SD card. -->
	<ExplorerWidget :widget="{ type: 'explorer', folder: '0:/' }" />
</template>

<script setup lang="ts">
import ExplorerWidget from "../../widgets/ExplorerWidget.vue";
</script>
