/**
 * Per-device view state of container widgets (MISSING-FEATURES-PLAN §B3): which tab of a `tabs` widget is showing, and
 * whether a collapsible `group`/`tabs` is folded.
 *
 * Deliberately NOT in the shared layout document: the layout is one file every browser opening the machine shares, and
 * "I am looking at the Probing tab" or "I folded this panel on my phone" is nobody else's business - saving it there
 * would also rewrite the settings file on every tab click. It lives in `localStorage` (try/catch, like the drawer width),
 * keyed by the placed item's id, so a tablet on the wall and a laptop each keep their own.
 */
import { ref } from "vue";

const TABS_KEY = "flexibleLayouts.selectedTabs";
const COLLAPSED_KEY = "flexibleLayouts.collapsedPanels";

/** Old entries are dropped past this many, so the store cannot grow without bound as panels come and go. */
const MAX_ENTRIES = 300;

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}
function writeJson(key: string, value: unknown): void {
	try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

function readTabs(): Record<string, string> {
	const raw = readJson<unknown>(TABS_KEY, {});
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) { return {}; }
	return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}
function readCollapsed(): Array<string> {
	const raw = readJson<unknown>(COLLAPSED_KEY, []);
	return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

const selectedTabs = ref<Record<string, string>>(readTabs());
const collapsed = ref<Array<string>>(readCollapsed());

/** The tab this device last showed for the widget `key` (an item id), if any. Reactive. */
export function getSelectedTab(key: string): string | undefined {
	return selectedTabs.value[key];
}
export function setSelectedTab(key: string, tabId: string): void {
	if (selectedTabs.value[key] === tabId) { return; }
	const next = { ...selectedTabs.value, [key]: tabId };
	const keys = Object.keys(next);
	if (keys.length > MAX_ENTRIES) { delete next[keys[0]]; }
	selectedTabs.value = next;
	writeJson(TABS_KEY, next);
}

/** Is the container `key` folded on this device? Reactive. */
export function isCollapsed(key: string): boolean {
	return collapsed.value.includes(key);
}
export function setCollapsed(key: string, fold: boolean): void {
	const has = collapsed.value.includes(key);
	if (fold === has) { return; }
	let next = fold ? [...collapsed.value, key] : collapsed.value.filter((k) => k !== key);
	if (next.length > MAX_ENTRIES) { next = next.slice(next.length - MAX_ENTRIES); }
	collapsed.value = next;
	writeJson(COLLAPSED_KEY, next);
}
export function toggleCollapsed(key: string): void {
	setCollapsed(key, !isCollapsed(key));
}

/** Re-read from storage (tests). */
export function resetContainerStateForTests(): void {
	selectedTabs.value = readTabs();
	collapsed.value = readCollapsed();
}
