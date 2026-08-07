/**
 * Probe roles: which controller probe index (sensors.probes[n]) serves which purpose. A routine
 * declares the role it needs (toolLength / workpiece / feature) and looks its probe index up here -
 * a role with no probe assigned leaves its routines disabled rather than silently borrowing another
 * probe. This is what stops a bore-finding routine from ever accidentally firing the tool-length
 * setter: two different fixtures, two different failure modes if crossed.
 */
import { useSettingsStore } from "@/stores/settings";

const PLUGIN_KEY = "flexibleLayouts";
const ROLES_KEY = "probeRoles";

export type ProbeRole = "toolLength" | "workpiece" | "feature";
export const PROBE_ROLES: ReadonlyArray<ProbeRole> = ["toolLength", "workpiece", "feature"];

export type ProbeRoleMap = Partial<Record<ProbeRole, number>>;

function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

export function getProbeRoles(): ProbeRoleMap {
	const c = container();
	return (c[ROLES_KEY] as ProbeRoleMap | undefined) ?? {};
}

export function setProbeRoles(roles: ProbeRoleMap): void {
	container()[ROLES_KEY] = roles;
}

/** Assign (or clear, with probeIndex null) the probe index for one role. */
export function setProbeRole(role: ProbeRole, probeIndex: number | null): void {
	const roles = { ...getProbeRoles() };
	if (probeIndex === null) {
		delete roles[role];
	} else {
		roles[role] = probeIndex;
	}
	setProbeRoles(roles);
}

/** The probe index assigned to a role, or null if unassigned - callers must treat null as "this
 *  routine is disabled", never fall back to a default probe index. */
export function probeIndexForRole(role: ProbeRole): number | null {
	return getProbeRoles()[role] ?? null;
}
