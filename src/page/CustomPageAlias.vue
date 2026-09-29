<template>
	<div />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";

import { resolveCustomPagePath } from "../model/pageSlug";
import { useLayoutStore } from "../model/store";

// An earlier address of a custom page (`PageLayout.legacyPaths`): send the visitor to the page's current one.
// This renders nothing on purpose - a built-in panel on the page derives the id its settings are saved under
// from the route path it first mounts under, so it must never mount while the route is still the old address.
const route = useRoute();
const router = useRouter();
const target = resolveCustomPagePath(useLayoutStore().document.value, route.path);
router.replace({ path: target ?? "/", query: route.query, hash: route.hash }).catch(() => { /* superseded navigation */ });
</script>
