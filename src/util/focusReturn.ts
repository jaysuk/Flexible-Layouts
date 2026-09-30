/**
 * Give keyboard focus back to where it was when a dialog closes (MISSING-FEATURES-PLAN §B8 step 7).
 *
 * Vuetify only restores focus for a dialog that has an `activator`; Flexible Layouts opens almost all of its dialogs
 * from a plain `v-model` flag (an Edit button, a menu item), so on close focus fell to <body> and a keyboard user
 * had to Tab in from the top of the page again. One observer covers every dialog instead of a hook in each:
 * when the first dialog opens it remembers the focused element, and when the last one has closed it puts focus back -
 * but only if focus was left stranded on <body> (never steal it from something the user has since chosen) and the
 * element is still in the page.
 */
const OPEN_DIALOG = ".v-dialog.v-overlay--active";

function focusedElement(): HTMLElement | null {
	const el = document.activeElement;
	return el instanceof HTMLElement && el !== document.body ? el : null;
}

/** Install the observer; returns its uninstaller. Safe to call where there is no DOM. */
export function installFocusReturn(): () => void {
	if (typeof document === "undefined" || typeof MutationObserver === "undefined") { return () => {}; }
	let opener: HTMLElement | null = null;
	let wasOpen = false;

	const check = () => {
		const open = document.querySelector(OPEN_DIALOG) !== null;
		if (open && !wasOpen) {
			// The class flips before Vuetify moves focus into the dialog, so this is still the opener.
			opener = focusedElement();
		} else if (!open && wasOpen) {
			const back = opener;
			opener = null;
			// Let the dialog finish leaving (and Vuetify do its own restoring, where it does) before deciding.
			setTimeout(() => {
				if (back && back.isConnected && focusedElement() === null) {
					back.focus({ preventScroll: true });
				}
			}, 0);
		}
		wasOpen = open;
	};

	const observer = new MutationObserver(check);
	observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
	check();
	return () => observer.disconnect();
}
