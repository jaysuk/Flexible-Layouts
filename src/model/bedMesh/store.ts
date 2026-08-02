/**
 * Loaded height-map + a pending-edit overlay, so discarding a half-finished session is just dropping
 * the overlay - it cannot half-fail. `loaded` is never mutated directly; edits only ever touch the
 * overlay, and `save()` is the one place they get merged in, and only once both halves of the write
 * have actually succeeded.
 *
 * Takes an injected `MachineIO` (the same interface `src/model/configBackup/machineIO.ts` already
 * binds to DWC's Pinia machine store) so this is testable against a fake, with no DWC/Vue-store
 * dependency of its own.
 */
import { computed, reactive, ref, type ComputedRef, type Ref } from "vue";
import type { MachineIO } from "dwc-config-backup-core";

import { gridStats, parseHeightmap, serializeHeightmap, setCell, type GridStats, type Heightmap } from "./heightmap";

const SYS_DIR = "0:/sys";
/** RRF's own default height-map filename (GCodes.h: DefaultHeightMapFile). */
export const DEFAULT_HEIGHTMAP_FILE = "heightmap.csv";

export type BedMeshLoadResult = "loaded" | "not-found" | "invalid";
export type BedMeshSaveResult = "saved" | "not-loaded" | "upload-failed" | "reload-failed";

export interface BedMeshStore {
	fileName: Ref<string>;
	loaded: Ref<Heightmap | null>;
	loading: Ref<boolean>;
	saving: Ref<boolean>;
	/** True while there are edits not yet written to the card. */
	dirty: ComputedRef<boolean>;
	/** Stats over what's CURRENTLY shown (loaded + pending overlay), for a live-updating summary. */
	liveStats: ComputedRef<GridStats | null>;
	valueAt(row: number, col: number): number | null;
	setValue(row: number, col: number, value: number | null): void;
	/** Drop every pending edit. Cannot half-fail - there is nothing to roll back on the card. */
	discard(): void;
	load(fileName?: string): Promise<BedMeshLoadResult>;
	save(): Promise<BedMeshSaveResult>;
}

function overlayKey(row: number, col: number): string {
	return `${row},${col}`;
}

/** loaded + overlay, merged into a new Heightmap. Pure - used by both liveStats and save(). */
function withOverlay(loaded: Heightmap, overlay: Map<string, number | null>): Heightmap {
	let merged = loaded;
	for (const [k, value] of overlay) {
		const [row, col] = k.split(",").map(Number);
		merged = setCell(merged, row, col, value);
	}
	return merged;
}

export function createBedMeshStore(io: MachineIO): BedMeshStore {
	const fileName = ref(DEFAULT_HEIGHTMAP_FILE);
	const loaded = ref<Heightmap | null>(null) as Ref<Heightmap | null>;
	const loading = ref(false);
	const saving = ref(false);
	const overlay = reactive(new Map<string, number | null>());

	const dirty = computed(() => overlay.size > 0);
	const liveStats = computed(() => (loaded.value ? gridStats(withOverlay(loaded.value, overlay)) : null));

	function valueAt(row: number, col: number): number | null {
		const k = overlayKey(row, col);
		if (overlay.has(k)) {
			return overlay.get(k) ?? null;
		}
		return loaded.value?.rows[row]?.[col] ?? null;
	}

	function setValue(row: number, col: number, value: number | null): void {
		overlay.set(overlayKey(row, col), value);
	}

	function discard(): void {
		overlay.clear();
	}

	async function load(name = fileName.value): Promise<BedMeshLoadResult> {
		loading.value = true;
		try {
			let text: string;
			try {
				text = await io.downloadText(`${SYS_DIR}/${name}`);
			} catch {
				return "not-found";
			}
			const hm = parseHeightmap(text);
			if (!hm) {
				return "invalid";
			}
			loaded.value = hm;
			fileName.value = name;
			overlay.clear();
			return "loaded";
		} finally {
			loading.value = false;
		}
	}

	async function save(): Promise<BedMeshSaveResult> {
		if (!loaded.value) {
			return "not-loaded";
		}
		const merged = withOverlay(loaded.value, overlay);
		const text = serializeHeightmap(merged);
		saving.value = true;
		try {
			try {
				await io.upload(`${SYS_DIR}/${fileName.value}`, new Blob([text], { type: "text/csv" }));
			} catch {
				return "upload-failed"; // nothing on the card changed - overlay stays, safe to retry
			}
			try {
				// The P parameter is the bare filename: RRF resolves it against sys itself
				// (GCodes6.cpp's LoadHeightMap -> MakeSysFileName), so a full "0:/sys/..." path here
				// would be resolved a second time against the same directory.
				await io.sendCode(`G29 S1 P"${fileName.value}"`);
			} catch {
				// Uploaded, but the machine did NOT reload - it's still compensating with the old map.
				// That is exactly the state an operator must not be told is "saved": keep the overlay so
				// Save can be retried (re-uploading identical bytes is harmless; only the reload needs
				// to succeed), and report a result distinct from "saved" so the UI doesn't imply success.
				return "reload-failed";
			}
			loaded.value = merged;
			overlay.clear();
			return "saved";
		} finally {
			saving.value = false;
		}
	}

	return { fileName, loaded, loading, saving, dirty, liveStats, valueAt, setValue, discard, load, save };
}
