/**
 * Access levels for kiosk-style deployments: Observer < Operator < Admin. Replaces the old flat
 * edit/escape lock with the same soft, client-side deterrent framing - see
 * docs/access-levels-design.md for the full design and its gap reviews.
 *
 * IMPORTANT: still not real security - anyone with browser devtools (or who stops the plugin) can
 * bypass it. Passwords are stored only as salted hashes. DWC is served over plain HTTP on a Duet,
 * where the Web Crypto API isn't reliably available, so a small non-cryptographic hash (cyrb53) is
 * used - adequate for a deterrent that's bypassable anyway.
 *
 * Setting up the lock means independently enabling zero, one or both restricted tiers (Observer,
 * Operator); the page loads as the most restrictive one enabled. Logging in is an explicit choice of
 * *which* tier to claim (Operator login only exists when both tiers are enabled - otherwise Operator
 * IS the baseline, with no separate password of its own), never a single field tried against
 * multiple hashes. Unlocking lasts for the browser session; a reload re-locks.
 */
import { ref, watch } from "vue";

import { useSettingsStore } from "@/stores/settings";

import { activateFlLayout, deactivateFlLayout, isFlLayoutActive } from "./layoutState";

const PLUGIN_KEY = "flexibleLayouts";
const ACCESS_KEY = "access";
const LEGACY_LOCK_KEY = "lock";
const SALT = "flexlayouts::v1::";

export type AccessLevel = "observer" | "operator" | "admin";
export type Capability = "interact" | "runJobs" | "manageFiles" | "editConfig" | "editLayout" | "leaveLayout";

export interface AccessConfig {
	/** Observer exists as a reachable, load-time baseline tier. */
	observerEnabled: boolean;
	/** Operator exists as a reachable, load-time baseline tier. */
	operatorEnabled: boolean;
	/** Admin password hash - required once either tier above is enabled. */
	adminHash: string;
	/** Operator password hash - only meaningful (set/asked-for) when BOTH tiers above are enabled. */
	operatorHash: string;
	/** Hide the emergency-stop button while at the Observer level (default off - safety). */
	hideEmergencyStop?: boolean;
}

function defaultConfig(): AccessConfig {
	return { observerEnabled: false, operatorEnabled: false, adminHash: "", operatorHash: "", hideEmergencyStop: false };
}

interface LegacyLockConfig { enabled: boolean; hash: string }

/**
 * Migrate the old flat lock: it always allowed interaction but blocked editing/leaving - exactly
 * the Operator baseline - so the old password becomes the Admin password (the way out of it). An
 * empty legacy hash (e.g. an interrupted save leaving `{enabled:true, hash:""}`) is treated as never
 * configured, never as a blank-password Admin login.
 */
function migrateLegacy(legacy: LegacyLockConfig): AccessConfig {
	if (!legacy.enabled || !legacy.hash) {
		return defaultConfig();
	}
	return { observerEnabled: false, operatorEnabled: true, adminHash: legacy.hash, operatorHash: "", hideEmergencyStop: false };
}

function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

export function getAccess(): AccessConfig {
	const c = container();
	if (c[ACCESS_KEY]) {
		return c[ACCESS_KEY] as AccessConfig;
	}
	if (c[LEGACY_LOCK_KEY]) {
		return migrateLegacy(c[LEGACY_LOCK_KEY] as LegacyLockConfig);
	}
	return defaultConfig();
}
export function setAccess(cfg: AccessConfig): void {
	container()[ACCESS_KEY] = cfg;
}

export function isAccessEnabled(): boolean {
	const cfg = getAccess();
	return cfg.observerEnabled || cfg.operatorEnabled;
}

/** The level the page loads as before any session login - the most restrictive enabled tier. */
export function defaultLevel(): AccessLevel {
	const cfg = getAccess();
	if (cfg.observerEnabled) {
		return "observer";
	}
	if (cfg.operatorEnabled) {
		return "operator";
	}
	return "admin";
}

const LEVEL_CAPS: Record<AccessLevel, ReadonlySet<Capability>> = {
	observer: new Set([]),
	operator: new Set(["interact", "runJobs"]),
	admin: new Set(["interact", "runJobs", "manageFiles", "editConfig", "editLayout", "leaveLayout"]),
};

/** Session elevation above the baseline - reset on reload (intentional). null = at the baseline. */
const sessionLevel = ref<AccessLevel | null>(null);

/** The level in effect right now: the session elevation if any, else the config baseline. */
export function currentLevel(): AccessLevel {
	return sessionLevel.value ?? defaultLevel();
}
export function can(cap: Capability): boolean {
	return LEVEL_CAPS[currentLevel()].has(cap);
}

/**
 * Built-in panels that provide real file management (upload/delete/rename) - the only FL surfaces
 * where `manageFiles` has an actual target, since every FL-native widget is single all-or-nothing
 * `disabled` with no partial browse-vs-edit mode. Gated by component name, mirroring
 * util/printLock.ts's MOVE_PANELS pattern.
 */
const MANAGE_ONLY_PANELS = new Set(["FileList", "JobFileList"]);

/**
 * Whether a placed widget should be access-locked right now: blocked outright when `interact` isn't
 * granted, or additionally blocked when it's one of the file-management built-in panels above and
 * `manageFiles` isn't granted (so Operator, who has `interact` but not `manageFiles`, still can't
 * reach a live file browser through FL).
 */
export function accessLockedFor(widget: { type: string; component?: string }): boolean {
	// These are the elevation mechanism itself (editModeToggle triggers the Admin prompt via
	// attemptToggleEdit, accessChip offers the login/relock prompt directly) - blocking them would
	// leave a restricted user with no way to log in from wherever they're placed. Both still enforce
	// their own gate internally (attemptToggleEdit re-checks `editLayout` before doing anything).
	if (widget.type === "editModeToggle" || widget.type === "accessChip") {
		return false;
	}
	if (!can("interact")) {
		return true;
	}
	if (widget.type === "builtinPanel" && widget.component && MANAGE_ONLY_PANELS.has(widget.component) && !can("manageFiles")) {
		return true;
	}
	return false;
}
/** Drop the session elevation (e.g. a "lock now" button); returns to the baseline level. */
export function relock(): void {
	sessionLevel.value = null;
}

/** cyrb53 - a small, fast, well-distributed non-crypto hash (unchanged from the old lock). */
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

/**
 * Attempt to elevate the session to Operator. Only succeeds when both tiers are enabled and the
 * password matches the Operator hash - an Operator-only config has no separate password (Operator
 * IS the baseline there), so this always fails in that case, matching the design.
 */
export function loginAsOperator(pw: string): boolean {
	const cfg = getAccess();
	if (cfg.observerEnabled && cfg.operatorEnabled && cfg.operatorHash && hashPassword(pw) === cfg.operatorHash) {
		sessionLevel.value = "operator";
		return true;
	}
	return false;
}
/** Attempt to elevate the session to Admin - the only login always available once access is enabled. */
export function loginAsAdmin(pw: string): boolean {
	const cfg = getAccess();
	if (cfg.adminHash && hashPassword(pw) === cfg.adminHash) {
		sessionLevel.value = "admin";
		return true;
	}
	return false;
}

/**
 * Treat a successful password entry as a session elevation to Admin (used right after setting/
 * changing the Admin password, so the user configuring it isn't immediately locked out).
 */
export function markAdmin(): void {
	sessionLevel.value = "admin";
}

// #region Login prompt mechanism (PasswordDialog, mounted in the shell, consumes these)
export type LoginChoice = "operator" | "admin";

const promptOpen = ref(false);
const promptError = ref(false);
/** Which login option(s) the open prompt should offer. Set each time the prompt is opened. */
const promptChoices = ref<Array<LoginChoice>>([]);
let resolver: ((ok: boolean) => void) | null = null;

export const accessPromptOpen = promptOpen;
export const accessPromptError = promptError;
export const accessPromptChoices = promptChoices;

/**
 * Login option(s) reachable from the CURRENT level right now - used by the shell's general
 * "Unlock…" entry point, which offers whatever elevation makes sense from wherever the session is.
 */
export function availableLogins(): Array<LoginChoice> {
	const cfg = getAccess();
	const level = currentLevel();
	if (level === "admin") {
		return [];
	}
	const choices: Array<LoginChoice> = [];
	if (level === "observer" && cfg.operatorEnabled) {
		choices.push("operator");
	}
	choices.push("admin");
	return choices;
}

function openPrompt(choices: Array<LoginChoice>): Promise<boolean> {
	promptError.value = false;
	promptChoices.value = choices;
	promptOpen.value = true;
	return new Promise((resolve) => { resolver = resolve; });
}

/** General elevation entry point (the shell's "Unlock…" chip): offers whichever login(s) are
 *  reachable from here right now. Resolves true as soon as either succeeds. */
export function requestElevation(): Promise<boolean> {
	if (currentLevel() === "admin") {
		return Promise.resolve(true);
	}
	return openPrompt(availableLogins());
}

/** Admin-specific entry point, for actions gated on editLayout/leaveLayout (edit mode, Settings,
 *  the escape guard) - an Operator login would never satisfy these, so only the Admin field is
 *  offered even when an Operator login also exists from here. */
export function requestAdmin(): Promise<boolean> {
	if (currentLevel() === "admin") {
		return Promise.resolve(true);
	}
	return openPrompt(["admin"]);
}

/** Submit a password against one specific offered login choice (the dialog shows one field per
 *  offered login and the user picks which they're claiming, rather than one field guessed twice). */
export function submitLogin(choice: LoginChoice, pw: string): void {
	const ok = choice === "operator" ? loginAsOperator(pw) : loginAsAdmin(pw);
	if (ok) {
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

// #region Escape guard
let guardInstalled = false;
let stopEscapeWatch: (() => void) | null = null;
/**
 * Block leaving Flexible Layouts' shell while restricted. Catches every escape vector (Settings'
 * own layout-switch control, the /BuiltInLayout URL, FL's own button, and switching to another
 * plugin's layout) by watching whether FL is the active layout: if that flips off while `leaveLayout`
 * isn't granted, re-activate FL synchronously (so the shell never actually swaps) and require Admin
 * first. Installed once. NOTE: merely navigating to a page (incl. /Settings) never flips this - only
 * actually deactivating FL's layout does, so this guard does not by itself protect page content
 * reachable via ordinary navigation (see FlexSettingsTab.vue's own gate on the Access section).
 */
export function installEscapeGuard(): void {
	if (guardInstalled) {
		return;
	}
	guardInstalled = true;
	stopEscapeWatch = watch(
		() => isFlLayoutActive(),
		(now, prev) => {
			if (prev && !now && !can("leaveLayout")) {
				activateFlLayout(); // revert before the shell can swap (also catches switch to another layout)
				void requestAdmin().then((ok) => {
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
