/**
 * Optional edit/escape lock for kiosk-style deployments.
 *
 * IMPORTANT: this is a soft, client-side deterrent - not real security. It stops casual editing and
 * casual escape-to-built-in, but anyone with browser devtools (or who stops the plugin) can bypass
 * it. The password is stored only as a salted hash. DWC is served over plain HTTP on a Duet, where
 * the Web Crypto API isn't available, so a small non-cryptographic hash (cyrb53) is used - adequate
 * for a deterrent that's bypassable anyway.
 *
 * When enabled, the user must enter the password to: (a) enter edit mode, and (b) leave the custom
 * layout (the escape guard catches the Settings switch and the /BuiltInLayout URL at the state
 * level). Unlocking lasts for the browser session; a reload re-locks.
 */
import { ref, watch } from "vue";

import { useSettingsStore } from "@/stores/settings";

import { activateFlLayout, deactivateFlLayout, isFlLayoutActive } from "./layoutState";

const PLUGIN_KEY = "flexibleLayouts";
const LOCK_KEY = "lock";
const SALT = "flexlayouts::v1::";

export interface LockConfig {
	enabled: boolean;
	hash: string;
}

/** Session unlock state - reset on reload (intentional). */
const unlocked = ref(false);
export const isUnlocked = unlocked;

function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

export function getLock(): LockConfig {
	return (container()[LOCK_KEY] as LockConfig | undefined) ?? { enabled: false, hash: "" };
}
export function setLock(cfg: LockConfig): void {
	container()[LOCK_KEY] = cfg;
}

export function isLockEnabled(): boolean {
	return getLock().enabled;
}
/** True when editing/escaping should be blocked right now. */
export function isLocked(): boolean {
	return getLock().enabled && !unlocked.value;
}
/** Drop the session unlock (e.g. a "lock now" button). */
export function relock(): void {
	unlocked.value = false;
}

/** cyrb53 - a small, fast, well-distributed non-crypto hash. */
export function hashPassword(pw: string): string {
	const str = SALT + pw;
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
export function verifyPassword(pw: string): boolean {
	return hashPassword(pw) === getLock().hash;
}

// #region Prompt mechanism (a PasswordDialog mounted in the shell consumes these)
const promptOpen = ref(false);
const promptError = ref(false);
let resolver: ((ok: boolean) => void) | null = null;

export const lockPromptOpen = promptOpen;
export const lockPromptError = promptError;

/** Resolve true when already unlocked/not locked; otherwise open the prompt and resolve on entry. */
export function requestUnlock(): Promise<boolean> {
	if (!isLocked()) {
		return Promise.resolve(true);
	}
	promptError.value = false;
	promptOpen.value = true;
	return new Promise((resolve) => { resolver = resolve; });
}
export function submitPassword(pw: string): void {
	if (verifyPassword(pw)) {
		unlocked.value = true;
		promptOpen.value = false;
		resolver?.(true);
		resolver = null;
	} else {
		promptError.value = true;
	}
}
export function cancelPrompt(): void {
	promptOpen.value = false;
	resolver?.(false);
	resolver = null;
}
// #endregion

/** Treat a successful password entry as a session unlock (used when enabling/changing the lock). */
export function markUnlocked(): void {
	unlocked.value = true;
}

// #region Escape guard
let guardInstalled = false;
let stopEscapeWatch: (() => void) | null = null;
/**
 * Block leaving Flexible Layouts' shell while locked. Catches every escape vector (Settings layout
 * picker, the /BuiltInLayout URL, FL's own button, and switching to another plugin's layout) by
 * watching whether FL is the active layout: if that flips off while locked, re-activate FL
 * synchronously (so the shell never actually swaps) and ask for the password first. Installed once.
 */
export function installEscapeGuard(): void {
	if (guardInstalled) {
		return;
	}
	guardInstalled = true;
	stopEscapeWatch = watch(
		() => isFlLayoutActive(),
		(now, prev) => {
			if (prev && !now && isLocked()) {
				activateFlLayout(); // revert before the shell can swap (also catches switch to another layout)
				void requestUnlock().then((ok) => {
					if (ok) {
						deactivateFlLayout();
					}
				});
			}
		},
	);
}

/**
 * Tear the escape guard down. The watcher lives for the whole app session (not tied to any
 * component), so it must be stopped explicitly when the plugin is unloaded or it would leak and a
 * reload would stack a second watcher. Called from the `dwcPluginUnloaded` handler in index.ts.
 */
export function uninstallEscapeGuard(): void {
	stopEscapeWatch?.();
	stopEscapeWatch = null;
	guardInstalled = false;
}
// #endregion
