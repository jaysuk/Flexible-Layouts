<template>
	<!-- Stock Jobs page content = the job-browser widget at its default root. -->
	<JobsWidget :widget="{ type: 'jobs', folder: '' }" />
</template>

<script setup lang="ts">
import JobsWidget from "../../widgets/JobsWidget.vue";
</script>
