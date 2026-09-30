import { onBeforeUnmount, onMounted, watch } from "vue";

import { registerHotkey, type HotkeyActivator } from "../model/hotkeys";

/**
 * Bind a widget's hotkey while the widget is mounted (MISSING-FEATURES-PLAN §B2). Registered on mount and dropped on
 * unmount - and re-bound if the combo is edited - so only widgets that are actually on screen respond.
 *
 * `activate` must be the widget's OWN click path, returning "locked" when the widget is disabled (print lock, access
 * lock, a disabling condition): the dispatcher then shows a brief "locked" notice instead of acting.
 */
export function useHotkey(combo: () => string | undefined, activate: HotkeyActivator): void {
	let unregister: () => void = () => {};
	let mounted = false;

	const rebind = () => {
		unregister();
		unregister = mounted ? registerHotkey(combo(), activate) : () => {};
	};

	onMounted(() => {
		mounted = true;
		rebind();
	});
	const stop = watch(combo, rebind);
	onBeforeUnmount(() => {
		mounted = false;
		stop();
		unregister();
		unregister = () => {};
	});
}
