/**
 * Build a MachineIdentity / live-directories view from the (loosely-typed, externally-owned) object
 * model. Kept in one place so BackupCreatePanel / RestorePanel / CloudPanel agree on the mapping.
 */
import type { MachineIdentity } from "./archive";
import { DEFAULT_DIR_PATH } from "./constants";
import type { BackupDirKind } from "./constants";
import type { ManifestBoard } from "./types";

interface LooseBoard {
	canAddress?: number | null;
	shortName?: string;
	firmwareVersion?: string;
	firmwareName?: string;
	name?: string;
	uniqueId?: string | null;
}

export function buildMachineIdentity(model: unknown): MachineIdentity {
	const m = model as { boards?: Array<LooseBoard>; network?: { hostname?: string; name?: string } } | undefined;
	const boards = Array.isArray(m?.boards) ? m!.boards! : [];
	const mapped: Array<ManifestBoard> = boards.map((b) => ({
		canAddress: b?.canAddress ?? null,
		shortName: b?.shortName ?? "",
		firmwareVersion: b?.firmwareVersion ?? "",
		uniqueId: b?.uniqueId ?? null,
	}));
	const main = boards[0];
	return {
		hostname: m?.network?.hostname ?? "",
		name: m?.network?.name ?? "",
		firmwareName: main?.firmwareName ?? "",
		firmwareVersion: main?.firmwareVersion ?? "",
		electronics: main?.name ?? "",
		boards: mapped,
	};
}

export function buildLiveDirectories(model: unknown): Record<BackupDirKind, string> {
	const m = model as { directories?: Partial<Record<BackupDirKind, string>> } | undefined;
	return {
		system: m?.directories?.system ?? DEFAULT_DIR_PATH.system,
		macros: m?.directories?.macros ?? DEFAULT_DIR_PATH.macros,
		filaments: m?.directories?.filaments ?? DEFAULT_DIR_PATH.filaments,
	};
}
