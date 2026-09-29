<template>
	<!-- Replacement for DWC's own Explorer page (opt-in, see Settings > G-code editor): the same file
		 browser + editor tabs, but G-code opens in the new editor. Fills the viewport below the app bar
		 like the stock page (`.dwc-page-fill` in DWC's settings.scss - mirrored here because a plugin's
		 scoped styles can't rely on it being present in every DWC build). -->
	<div class="fb-explorer">
		<v-card class="fill-height">
			<ExplorerPanel :target="target" @dirty-change="dirty = $event" />
		</v-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import i18n from "@/i18n";

import { parseExplorerRoute } from "../../model/explorerRoute";
import ExplorerPanel from "../../widgets/ExplorerPanel.vue";

// DWC links here with `/Explorer/<dir>` and `/Explorer/edit/<file>` (upload notifications, the macro
// list, filament rows, ...) - the panel follows whatever the URL currently asks for.
const route = useRoute();
const target = computed(() => parseExplorerRoute(route.params as Record<string, string | Array<string>>));

// The stock page is kept alive while you browse elsewhere, so open editors (and unsaved edits) survive
// a trip to another page; this replacement is unmounted instead, so warn before throwing edits away.
const router = useRouter();
const dirty = ref(false);
const removeGuard = router.beforeEach((to) => {
	const staysOnExplorer = to.path === "/Explorer" || to.path.startsWith("/Explorer/");
	if (dirty.value && !staysOnExplorer && !window.confirm(i18n.global.t("plugins.flexibleLayouts.files.leaveUnsaved"))) {
		return false;
	}
	return true;
});
onBeforeUnmount(() => removeGuard());
</script>

<style scoped>
.fb-explorer {
	min-height: 0;
	/* Same maths as DWC's `.dwc-page-fill`: viewport minus the app bar (Vuetify's --v-layout-top)... */
	height: calc(100dvh - var(--v-layout-top, 64px));
}
@media (min-width: 840px) {
	.fb-explorer {
		/* ...and, from md up, the 16 px page padding above and below. */
		height: calc(100dvh - var(--v-layout-top, 64px) - 32px);
	}
}
</style>
