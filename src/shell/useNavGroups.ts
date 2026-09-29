/**
 * The navigation entries the user should see, grouped by category: DWC's menu store minus what
 * DWC itself hides globally, minus pages hidden via this plugin, minus pages whose `showWhen` rule
 * doesn't currently match, in the user's saved order. Shared by the side drawer (FlexShell) and the
 * phone hub (MobileHub) so both always list exactly the same pages.
 */
import { computed } from "vue";

import { type MenuItem, useMenuStore } from "@/stores/menu";
import { useMachineStore } from "@/stores/machine";

import { can } from "../model/access";
import { applyNavOrder, isHidden } from "../model/pageManager";
import { useLayoutStore } from "../model/store";
import { evaluateRule } from "../util/conditions";

/** Route of DWC's plugin-management page, where the plugin could be stopped/uninstalled. */
export const PLUGINS_PATH = "/Plugins";

export function useNavGroups() {
	const machineStore = useMachineStore();
	const menuStore = useMenuStore();
	const layoutStore = useLayoutStore();

	function pageVisible(path: string): boolean {
		const page = layoutStore.document.value.pages[path];
		return evaluateRule(machineStore.model, page?.showWhen);
	}

	function orderedItems(categoryKey: string): Array<MenuItem> {
		// While restricted, hide the Plugins page from the nav too (it's where the plugin could be stopped).
		const hidePlugins = !can("leaveLayout");
		const items = menuStore.itemsByCategory(categoryKey)
			.filter((i) => !isHidden(i.path) && pageVisible(i.path) && !(hidePlugins && i.path === PLUGINS_PATH));
		const byPath = new Map(items.map((i) => [i.path, i]));
		return applyNavOrder(items.map((i) => i.path)).map((p) => byPath.get(p)).filter(Boolean) as Array<MenuItem>;
	}

	// Categories that still have at least one visible item after plugin-hide filtering, so empty
	// sections don't render a dangling subheader.
	return computed(() =>
		menuStore.visibleCategories
			.map((category) => ({ category, items: orderedItems(category.key) }))
			.filter((group) => group.items.length > 0));
}
