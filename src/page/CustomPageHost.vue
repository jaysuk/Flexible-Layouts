<template>
	<FlexPage :page-id="pageId" kind="custom" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import FlexPage from "./FlexPage.vue";

// One component services every user-created page: the page's id IS its route path, so we read it
// from the active route. FlexPage watches the id and reloads when navigating between custom pages.
const route = useRoute();
const pageId = computed(() => route.path);
</script>
