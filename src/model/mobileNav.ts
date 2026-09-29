/**
 * Phone navigation style. Below md, DWC's own shell has no side drawer: `/` is a hub of tiles to every
 * page, a back arrow returns to it, and the drawer toggle is gone. Flexible Layouts keeps its drawer by
 * default (existing phone users rely on it and on a customised phone dashboard at `/`); this opts a
 * device into the stock behaviour. Per device, so it lives in localStorage rather than the layout
 * document, and is a reactive ref so flipping it in Settings applies without a reload.
 */
import { ref } from "vue";

const KEY = "flexibleLayouts.stockMobileNav";

function read(): boolean {
	try {
		return window.localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

/** True when this device uses DWC-style phone navigation (hub + back button) below md. */
export const stockMobileNav = ref(read());

export function setStockMobileNav(on: boolean): void {
	stockMobileNav.value = on;
	try {
		window.localStorage.setItem(KEY, on ? "1" : "0");
	} catch { /* private mode / blocked storage: still applies for this session */ }
}
