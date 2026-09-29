<template>
	<!-- Replacement for DWC's own Explorer page (opt-in, see Settings > G-code editor): the same file
		 browser + editor tabs, but G-code opens in the new editor. Fills the viewport below the app bar
		 like the stock page (`.dwc-page-fill` in DWC's settings.scss - mirrored here because a plugin's
		 scoped styles can't rely on it being present in every DWC build). -->
	<div class="fb-explorer">
		<v-card class="fill-height">
			<ExplorerPanel :target="target" :session-key="EXPLORER_PAGE_SESSION"
						   @dirty-change="dirty = $event" @location="onLocation" />
		</v-card>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import i18n from "@/i18n";

import { explorerUrl, parseExplorerRoute, sameExplorerTarget, type ExplorerTarget } from "../../model/explorerRoute";
import { EXPLORER_PAGE_SESSION } from "../../model/explorerSession";
import ExplorerPanel from "../../widgets/ExplorerPanel.vue";

// DWC links here with `/Explorer/<dir>` and `/Explorer/edit/<file>` (upload notifications, the macro
// list, filament rows, ...) - the panel follows whatever the URL currently asks for.
const route = useRoute();
// `undefined` once the route has moved off Explorer: on the way out the page is still mounted for a moment and
// `route.params` is already the NEXT page's (empty) - read as an Explorer URL that is "browse the root", which
// would throw away where you were just as you leave it.
const onExplorer = (path: string) => path === "/Explorer" || path.startsWith("/Explorer/");
const target = computed(() => onExplorer(route.path)
	? parseExplorerRoute(route.params as Record<string, string | Array<string>>)
	: undefined);

// The stock page is kept alive while you browse elsewhere, so open editors survive a trip to another page.
// This replacement is unmounted instead, but its tabs live in a session (model/explorerSession.ts) that is
// still there when it comes back - including the unsaved text of any tab in the new editor. What CAN'T come
// back is an unsaved edit in DWC's own Monaco (it gives its text to nobody), so only that is worth a warning.
const router = useRouter();
const dirty = ref(false);
const removeGuard = router.beforeEach((to) => {
	if (dirty.value && !onExplorer(to.path) && !window.confirm(i18n.global.t("plugins.flexibleLayouts.files.leaveUnsaved"))) {
		return false;
	}
	return true;
});
onBeforeUnmount(() => removeGuard());

// The URL follows the panel, like the stock page's: opening a file or a folder, or switching tab, puts it in
// the address bar (so Back, refresh and a bookmark all land where you were). The panel is the source of truth
// here; a URL that already says what the panel shows is left alone, which is also what stops a route change
// that the panel itself just caused from being applied a second time.
// The first report is `replace`d: it is the panel catching the URL up with a restored session (arriving at a
// bare `/Explorer` while an editor is open), not a step the user took.
let reported = false;
function onLocation(location: ExplorerTarget): void {
	const first = !reported;
	reported = true;
	if (!target.value || sameExplorerTarget(location, target.value)) return; // off Explorer already: not ours to steer
	const url = explorerUrl(location);
	void (first ? router.replace(url) : router.push(url));
}
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
