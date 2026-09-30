/**
 * Automatic profile switching (MISSING-FEATURES-PLAN §B5): a profile can say "take over when the machine is in CNC mode /
 * when a print is running / when this object-model condition holds", so a wall tablet or a dual-use machine shows the
 * right interface without anyone pressing anything.
 *
 * Three properties matter, and each has a test:
 *  - **Per device.** It only ever sets this browser's "showing profile" (model/store.ts `deviceProfileOverride`); the
 *    shared `activeProfile` in the layout document is never written, so one browser's switch cannot flip another's, and
 *    the settings file is not rewritten on every change. Manual switching is unchanged (it writes the shared pointer).
 *  - **Edge-triggered.** Rules are evaluated when something they depend on CHANGES (mode, print start/end, a condition
 *    flipping), not continuously - so a manual switch made afterwards sticks until the next edge. The first look at a
 *    freshly loaded machine counts as an edge, so a kiosk comes up in the right profile.
 *  - **First match wins**, in profile order. An optional "return when it ends" hands the screen back to the profile it
 *    took over from - but only if nobody has switched in the meantime.
 *
 * Switching here is system-initiated, so it deliberately bypasses the Admin-only manual switch: that is the point on a
 * locked-down wall display (docs/access-levels-design.md).
 */
import { ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import { evaluateRule } from "../util/conditions";
import { isPrintingStatus } from "../util/printLock";
import type { AutoSwitchRule } from "./document";
import { CUSTOM_PAGE_PREFIX } from "./pageSlug";
import { showProfileOnThisDevice } from "./profiles";
import { ensureProfiles, getActiveProfileId, useLayoutStore } from "./store";

// #region device setting
const ENABLED_KEY = "flexibleLayouts.autoProfile";
function readEnabled(): boolean {
	try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
}
/** Automatic switching on, on THIS device. Off by default: a profile changing by itself is a surprise to opt in to. */
export const autoProfileEnabled = ref(readEnabled());
export function setAutoProfileEnabled(on: boolean): void {
	autoProfileEnabled.value = on;
	try { if (on) { localStorage.setItem(ENABLED_KEY, "1"); } else { localStorage.removeItem(ENABLED_KEY); } } catch { /* storage blocked */ }
}
// #endregion

// #region pure rule logic
export interface AutoContext {
	machineMode?: string;
	printing: boolean;
	/** The object model, for `condition` rules. */
	model: unknown;
}

export interface AutoProfile {
	id: string;
	name: string;
	rule?: AutoSwitchRule;
}

/** Does this rule hold right now? An empty condition never does (unlike a page's show-when, which treats "no rule" as true). */
export function ruleHolds(rule: AutoSwitchRule | undefined, ctx: AutoContext): boolean {
	if (!rule) { return false; }
	switch (rule.on) {
		case "machineMode":
			return !!ctx.machineMode && ctx.machineMode.toLowerCase() === rule.value.toLowerCase();
		case "printing":
			return ctx.printing;
		case "condition":
			return !!rule.rule?.omPath && evaluateRule(ctx.model, rule.rule);
		default:
			return false;
	}
}

/** The first profile, in order, whose rule holds. */
export function pickProfile(profiles: Array<AutoProfile>, ctx: AutoContext): AutoProfile | undefined {
	return profiles.find((p) => ruleHolds(p.rule, ctx));
}

/** What changed about a switch, for the "why did it switch" line. */
export interface SwitchReason {
	kind: "machineMode" | "printing" | "condition" | "ended";
	/** The mode for `machineMode`. */
	value?: string;
}

export function reasonFor(rule: AutoSwitchRule): SwitchReason {
	return rule.on === "machineMode" ? { kind: "machineMode", value: rule.value } : { kind: rule.on };
}

/** Everything a rule can react to, boiled down to a string: it changes exactly when an edge could have happened. */
export function signature(profiles: Array<AutoProfile>, ctx: AutoContext): string {
	return `${(ctx.machineMode ?? "").toLowerCase()}|${ctx.printing ? 1 : 0}|` + profiles.map((p) => (p.rule ? (ruleHolds(p.rule, ctx) ? "1" : "0") : "-")).join("");
}
// #endregion

// #region controller
export interface AutoHost {
	enabled(): boolean;
	profiles(): Array<AutoProfile>;
	/** Null until the machine model has loaded (no status yet) - nothing is evaluated before then. */
	context(): AutoContext | null;
	/** The profile this device is showing right now. */
	showing(): string;
	/** Show a profile on this device; false if it could not. */
	show(id: string): boolean;
}

export interface AutoSwitch {
	profileId: string;
	reason: SwitchReason;
}

export class AutoProfileController {
	private lastSig: string | null = null;
	/** Set when a switch asked to hand the screen back: `to` is the profile we moved to, `from` the one we left. */
	private returnTo: { from: string; to: string } | null = null;

	constructor(private readonly host: AutoHost) {}

	/** The signature to watch, or null while automatic switching is off or the machine is not loaded. Reads reactive state. */
	peekSignature(): string | null {
		if (!this.host.enabled()) { return null; }
		const ctx = this.host.context();
		return ctx ? signature(this.host.profiles(), ctx) : null;
	}

	/** Look at the machine now. Returns the switch it made, if any. Cheap and idempotent between edges. */
	evaluate(): AutoSwitch | null {
		const sig = this.peekSignature();
		if (sig === null) {
			this.lastSig = null; // off, or not loaded: re-baseline when it is
			return null;
		}
		if (sig === this.lastSig) { return null; } // no edge: leave whatever is showing alone
		this.lastSig = sig;

		const ctx = this.host.context()!;
		const profiles = this.host.profiles();
		const target = pickProfile(profiles, ctx);
		const showing = this.host.showing();

		if (target) {
			if (target.id === showing) { return null; }
			// Remember where we came from if this rule wants the screen handed back - and if we are hopping from one
			// automatic profile to another, keep the ORIGINAL place to return to, not the intermediate one.
			const origin = this.returnTo && this.returnTo.to === showing ? this.returnTo.from : showing;
			this.returnTo = target.rule?.returnWhenEnds ? { from: origin, to: target.id } : null;
			if (!this.host.show(target.id)) { this.returnTo = null; return null; }
			return { profileId: target.id, reason: reasonFor(target.rule!) };
		}

		// Nothing holds any more. Hand back - but only if we are still on the profile we switched to.
		const back = this.returnTo;
		this.returnTo = null;
		if (back && showing === back.to && back.from !== showing && this.host.profiles().some((p) => p.id === back.from)) {
			if (this.host.show(back.from)) { return { profileId: back.from, reason: { kind: "ended" } }; }
		}
		return null;
	}

	reset(): void {
		this.lastSig = null;
		this.returnTo = null;
	}
}
// #endregion

// #region installation
export interface AutoSwitchLog {
	at: number;
	profileId: string;
	profileName: string;
	reason: SwitchReason;
}
/** The most recent automatic switch on this device (memory only) - shown as "why did it switch". */
export const lastAutoSwitch = ref<AutoSwitchLog | null>(null);

export interface InstallOptions {
	/** Move the router. Needed because a custom page of the old profile may not exist in the new one. */
	navigate: (path: string) => void;
	currentPath: () => string;
	/** Called after each automatic switch (e.g. to toast it). */
	onSwitched?: (log: AutoSwitchLog) => void;
}

let controller: AutoProfileController | null = null;
let stopWatch: (() => void) | null = null;

/** Read the machine store + layout store into what the controller needs. */
function liveHost(): AutoHost {
	const machine = useMachineStore();
	const store = useLayoutStore();
	return {
		enabled: () => autoProfileEnabled.value,
		profiles: () => {
			void store.document.value; // re-run when the layout changes (a rule edited in the profile manager)
			return profileList();
		},
		context: () => {
			const state = (machine.model as { state?: { status?: string; machineMode?: string } }).state;
			if (!machine.isConnected || !state?.status) { return null; }
			return { machineMode: state.machineMode, printing: isPrintingStatus(state.status), model: machine.model };
		},
		showing: () => getActiveProfileId(),
		show: (id) => showProfileOnThisDevice(id),
	};
}

/** Every profile with its rule, in profile order. */
function profileList(): Array<AutoProfile> {
	const { profiles } = ensureProfiles();
	return Object.entries(profiles).map(([id, doc]) => ({ id, name: doc.meta.name || id, rule: doc.meta.autoSwitch }));
}

export function installAutoProfile(opts: InstallOptions): () => void {
	uninstallAutoProfile();
	const host = liveHost();
	const ctl = new AutoProfileController(host);
	controller = ctl;

	const run = () => {
		const result = ctl.evaluate();
		if (!result) { return; }
		const name = profileList().find((p) => p.id === result.profileId)?.name ?? result.profileId;
		const log: AutoSwitchLog = { at: Date.now(), profileId: result.profileId, profileName: name, reason: result.reason };
		lastAutoSwitch.value = log;
		// A custom page of the previous profile may not exist here: don't leave the router on a dead address.
		const path = opts.currentPath();
		if (path.startsWith(CUSTOM_PAGE_PREFIX) && !useLayoutStore().getPage(path)) {
			opts.navigate(useLayoutStore().document.value.startupPath || "/");
		}
		opts.onSwitched?.(log);
	};

	stopWatch = watch(() => ctl.peekSignature(), run, { immediate: true });
	return uninstallAutoProfile;
}

export function uninstallAutoProfile(): void {
	stopWatch?.();
	stopWatch = null;
	controller?.reset();
	controller = null;
}
// #endregion
