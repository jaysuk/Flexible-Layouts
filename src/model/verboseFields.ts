/**
 * Ref-counted access to DWC's object-model "verbose" query flag (`useMachineStore().setVerboseQueries`,
 * added in DWC 3.7.0-beta.3), plus a list of the OM paths that flag actually gates.
 *
 * RRF's object model marks some fields `ObjectModelEntryFlags::verbose` ("omit reporting this value by
 * default" - src/ObjectModel/ObjectModel.h) so they're skipped from every poll unless a client opts in.
 * DWC's own machine store defaults `verboseQueries` to false and documents it as connector-wide and
 * all-or-nothing: "must only be set while something displays them" (src/stores/machine.ts). Its one
 * existing consumer, the built-in Object Model Browser, enforces that by toggling the flag on while its
 * page is open and off when it isn't (src/plugins/ObjectModelBrowser/ObjectModelBrowser.vue). Because
 * it's a single shared boolean (not per-field), FL mirrors that discipline with a ref count rather than
 * an unconditional "on at plugin load": any number of FL widgets/dialogs can independently need verbose
 * fields, and the flag must only drop once none of them do, or one closing would starve the others still
 * showing a value.
 *
 * `setVerboseQueries` itself is only present from DWC 3.7.0-beta.3 onward, and `plugin.json`'s
 * `dwcVersion: "auto-major"` can't express that floor (see useFlexDisplay.ts's doc comment for the
 * full reasoning) - read it as a plain property access and no-op if it's missing, so an older 3.7
 * install just never gets verbose fields instead of throwing when a widget happens to need one.
 */
import { useMachineStore } from "@/stores/machine";

let refCount = 0;

function setVerbose(wanted: boolean): void {
	const store = useMachineStore() as { setVerboseQueries?: (v: boolean) => void };
	store.setVerboseQueries?.(wanted);
}

export function acquireVerboseQueries(): void {
	refCount += 1;
	if (refCount === 1) {
		setVerbose(true);
	}
}

export function releaseVerboseQueries(): void {
	if (refCount === 0) {
		return;
	}
	refCount -= 1;
	if (refCount === 0) {
		setVerbose(false);
	}
}

export function resetForTests(): void {
	refCount = 0;
}

/**
 * OM path prefixes flagged `verbose` in RRF's source that are plausible dashboard read-outs (a live
 * numeric/text value a ValueWidget/GaugeClusterWidget/etc. would show) - found via
 * `ObjectModelEntryFlags::verbose` in RepRapFirmware's src/Tools/Spindle.cpp. Deliberately excludes the
 * OTHER verbose fields found in the same audit (src/Platform/RepRap.cpp's `limits.*` array-capacity
 * constants, directory paths, `network.interfaces[].type`, `volumes[].path`) - those are static
 * configuration, not something a live dashboard widget is meaningfully built around, so they're not
 * worth the extra polled payload of matching them here too.
 *
 * Kept as a match list (rather than, say, unconditionally acquiring for every configured omPath)
 * because most FL widgets read ordinary always-on fields (temperatures, position, status) - matching
 * only the fields that genuinely need it keeps the ref count meaningful instead of trivially always > 0.
 */
const VERBOSE_PATH_PATTERNS: Array<RegExp> = [
	/^spindles\[\d+\]\.(frequency|idlePwm|max|maxPwm|min|minPwm|type)$/,
];

/** Whether resolving `path` against the object model requires the verbose query flag to be set. */
export function pathNeedsVerboseQueries(path: string | undefined | null): boolean {
	if (!path) {
		return false;
	}
	return VERBOSE_PATH_PATTERNS.some((re) => re.test(path));
}
