import { ref, watch, type Ref } from "vue";

/**
 * Defer mounting a heavy dialog until it is first opened.
 *
 * The editor dialogs (PropertiesDialog is ~2000 lines, WidgetPalette + GroupEditor are big too) were
 * rendered unconditionally, so every FlexPage instantiated them on load even in pure view mode - and
 * because GroupEditor embeds its own palette + properties dialog, and the shell renders a FlexPage
 * for the status bar as well as the page itself plus HeaderWidgets, a plain view-mode page was paying
 * to construct roughly five copies of each. Vuetify only renders a dialog's *content* lazily; the
 * component instance itself, its setup and all its reactive state are still created.
 *
 * Gate the component on the returned flag (`v-if`) instead. It flips true the first time the dialog
 * opens and stays true afterwards, so the open/close transitions behave exactly as before - the only
 * change is that a dialog you never open is never built.
 */
export function useLazyDialog(open: Ref<boolean>): Ref<boolean> {
	const mounted = ref(open.value);
	watch(open, (isOpen) => {
		if (isOpen) {
			mounted.value = true;
		}
	});
	return mounted;
}
