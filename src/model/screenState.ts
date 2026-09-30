/**
 * Fullscreen, kiosk mode and "keep screen awake" (MISSING-FEATURES-PLAN §B6).
 *
 * All three are PER-DEVICE: a wall tablet in kiosk mode must not turn every other browser that opens the same board
 * into a kiosk, so nothing here touches the shared layout document - it is `localStorage` (try/catch, like the
 * drawer width) and live browser state.
 *
 * Every browser API is feature-detected, because they are unevenly available: iPhone Safari has no element
 * fullscreen; the Screen Wake Lock API exists only in a secure context, and DWC is usually served over plain
 * `http://` on a LAN. Callers get a reason string for what is unavailable, so the UI can say why instead of
 * silently doing nothing.
 */
import { ref } from "vue";

import { can, currentLevel, isAccessEnabled, requestAdmin } from "./access";
import { exitEditMode } from "./editorState";

const KIOSK_KEY = "flexibleLayouts.kiosk";
const WAKE_KEY = "flexibleLayouts.keepAwake";

function readFlag(key: string): boolean {
	try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string, on: boolean): void {
	try { if (on) { localStorage.setItem(key, "1"); } else { localStorage.removeItem(key); } } catch { /* storage blocked */ }
}

// #region Fullscreen
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export const isFullscreen = ref(false);
let fsListening = false;

function fsDoc(): FsDocument { return document as FsDocument; }

function syncFullscreen(): void {
	isFullscreen.value = !!(fsDoc().fullscreenElement ?? fsDoc().webkitFullscreenElement);
}
function ensureFullscreenListener(): void {
	if (fsListening || typeof document === "undefined") { return; }
	fsListening = true;
	document.addEventListener("fullscreenchange", syncFullscreen);
	document.addEventListener("webkitfullscreenchange", syncFullscreen);
	syncFullscreen();
}

/** Element fullscreen needs support AND permission (an iframe without `allowfullscreen` reports false). */
export function fullscreenSupported(): boolean {
	if (typeof document === "undefined") { return false; }
	const d = fsDoc();
	const el = document.documentElement as FsElement;
	return (d.fullscreenEnabled === true || d.webkitFullscreenEnabled === true)
		&& (typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function");
}

/** Must be called from a user gesture (a click) or the browser refuses. Resolves to whether fullscreen is now on. */
export async function enterFullscreen(): Promise<boolean> {
	ensureFullscreenListener();
	if (!fullscreenSupported()) { return false; }
	const el = document.documentElement as FsElement;
	try {
		if (el.requestFullscreen) { await el.requestFullscreen(); } else { await el.webkitRequestFullscreen?.(); }
	} catch {
		return false;
	}
	syncFullscreen();
	return isFullscreen.value;
}
export async function exitFullscreen(): Promise<void> {
	ensureFullscreenListener();
	const d = fsDoc();
	if (!(d.fullscreenElement ?? d.webkitFullscreenElement)) { return; }
	try {
		if (d.exitFullscreen) { await d.exitFullscreen(); } else { await d.webkitExitFullscreen?.(); }
	} catch { /* already out */ }
	syncFullscreen();
}
export async function toggleFullscreen(): Promise<void> {
	ensureFullscreenListener();
	if (isFullscreen.value) { await exitFullscreen(); } else { await enterFullscreen(); }
}
/** Start tracking fullscreen changes (also entered/left with Esc or F11, which we cannot intercept). */
export function watchFullscreen(): void {
	ensureFullscreenListener();
}
// #endregion

// #region Kiosk
/** True while the shell hides its app bar and drawer. Per device, kept across reloads. */
export const kioskActive = ref(readFlag(KIOSK_KEY));

/**
 * Can this session leave kiosk without proof? Only when no access lock is configured, or the session is already
 * Admin. Otherwise leaving asks for the Admin password - so a wall display can't be un-kiosked by a passer-by
 * (soft, client-side, like the rest of the access lock; see docs/access-levels-design.md).
 */
export function kioskExitNeedsPassword(): boolean {
	return isAccessEnabled() && currentLevel() !== "admin" && !can("leaveLayout");
}

export function enterKiosk(): void {
	kioskActive.value = true;
	writeFlag(KIOSK_KEY, true);
	exitEditMode(); // nothing to edit with no chrome, and it must not survive into a locked display
}

/** Leave kiosk. Resolves false (and stays in kiosk) when a required password was declined. */
export async function exitKiosk(): Promise<boolean> {
	if (!kioskActive.value) { return true; }
	if (kioskExitNeedsPassword() && !(await requestAdmin())) { return false; }
	kioskActive.value = false;
	writeFlag(KIOSK_KEY, false);
	return true;
}

/**
 * `?kiosk=1` enters kiosk, `?kiosk=0` leaves it (through the same password gate). Read from the real address, and
 * from the hash query too, since DWC uses hash routing on some builds. Returns what was requested, if anything.
 */
export function applyKioskQuery(href: string = typeof location === "undefined" ? "" : location.href): "enter" | "exit" | null {
	let value: string | null = null;
	try {
		const url = new URL(href);
		value = url.searchParams.get("kiosk");
		if (value === null && url.hash.includes("?")) {
			value = new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1)).get("kiosk");
		}
	} catch {
		return null;
	}
	if (value === "1") { enterKiosk(); return "enter"; }
	if (value === "0") { void exitKiosk(); return "exit"; }
	return null;
}
// #endregion

// #region Keep screen awake (Screen Wake Lock API)
interface WakeLockSentinelLike { release(): Promise<void>; addEventListener(type: "release", cb: () => void): void }
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };

/** The user WANTS the screen kept awake on this device (remembered). */
export const keepAwakeWanted = ref(readFlag(WAKE_KEY));
/** A wake lock is actually held right now. */
export const keepAwakeActive = ref(false);

let sentinel: WakeLockSentinelLike | null = null;
let visibilityHooked = false;

/**
 * Why keeping the screen awake is impossible here, or null when it is available. `insecure` is the common one:
 * `navigator.wakeLock` does not exist on a plain-HTTP page, so the UI points at TLS setup.
 */
export function keepAwakeUnavailableReason(): "insecure" | "unsupported" | null {
	if (typeof navigator === "undefined") { return "unsupported"; }
	if (typeof window !== "undefined" && window.isSecureContext === false) { return "insecure"; }
	return (navigator as WakeLockNavigator).wakeLock ? null : "unsupported";
}

async function acquireWakeLock(): Promise<void> {
	if (sentinel || keepAwakeUnavailableReason() !== null) { return; }
	try {
		const lock = await (navigator as WakeLockNavigator).wakeLock!.request("screen");
		sentinel = lock;
		keepAwakeActive.value = true;
		lock.addEventListener("release", () => {
			if (sentinel === lock) { sentinel = null; }
			keepAwakeActive.value = false;
		});
	} catch {
		keepAwakeActive.value = false; // refused (hidden tab, battery saver) - retried on the next visibility change
	}
}
async function releaseWakeLock(): Promise<void> {
	const lock = sentinel;
	sentinel = null;
	keepAwakeActive.value = false;
	try { await lock?.release(); } catch { /* already released */ }
}
function onVisibility(): void {
	// The browser drops a wake lock whenever the tab is hidden; take it back when the tab returns.
	if (document.visibilityState === "visible" && keepAwakeWanted.value) { void acquireWakeLock(); }
}
function hookVisibility(): void {
	if (visibilityHooked || typeof document === "undefined") { return; }
	visibilityHooked = true;
	document.addEventListener("visibilitychange", onVisibility);
}

/** Turn keep-awake on or off for this device. Returns false when it cannot be turned on here. */
export async function setKeepAwake(on: boolean): Promise<boolean> {
	if (!on) {
		keepAwakeWanted.value = false;
		writeFlag(WAKE_KEY, false);
		await releaseWakeLock();
		return true;
	}
	if (keepAwakeUnavailableReason() !== null) { return false; }
	keepAwakeWanted.value = true;
	writeFlag(WAKE_KEY, true);
	hookVisibility();
	await acquireWakeLock();
	return keepAwakeActive.value;
}

/** At startup: honour a remembered "keep awake" choice (no user gesture is needed to take a wake lock). */
export function restoreKeepAwake(): void {
	if (!keepAwakeWanted.value) { return; }
	hookVisibility();
	void acquireWakeLock();
}

/** Undo everything installed above. Called when the plugin unloads and by tests. */
export function teardownScreenState(): void {
	if (typeof document !== "undefined") {
		document.removeEventListener("fullscreenchange", syncFullscreen);
		document.removeEventListener("webkitfullscreenchange", syncFullscreen);
		document.removeEventListener("visibilitychange", onVisibility);
	}
	fsListening = false;
	visibilityHooked = false;
	void releaseWakeLock();
}

/** Reset every piece of in-memory state to what storage says (tests). */
export function resetScreenStateForTests(): void {
	teardownScreenState();
	kioskActive.value = readFlag(KIOSK_KEY);
	keepAwakeWanted.value = readFlag(WAKE_KEY);
	isFullscreen.value = false;
	sentinel = null;
}
// #endregion
