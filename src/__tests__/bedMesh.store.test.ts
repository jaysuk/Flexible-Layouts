import { describe, expect, it } from "vitest";
import type { MachineIO } from "dwc-config-backup-core";

import { createBedMeshStore, DEFAULT_HEIGHTMAP_FILE } from "../model/bedMesh/store";

const FIXTURE =
	"RepRapFirmware height map file v2 generated at 2026-01-01 00:00, min error -0.050, max error 0.200, mean 0.050, deviation 0.089\n" +
	"axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1\n" +
	"X,Y,5.00,25.00,5.00,15.00,-1.00,10.00,10.00,3,2\n" +
	"  0.100, -0.050,  0.000\n" +
	" -0.000,  0.200,      0\n";

/** A fake MachineIO: an in-memory path->text map, sent-code log, and per-op failure switches so the
 *  "must not report success on a half-failed save" paths are exercised, not assumed. */
function fakeIO(seed: Record<string, string> = {}) {
	const files = new Map<string, string>(Object.entries(seed));
	const sentCodes: Array<string> = [];
	const fail = { download: false, upload: false, sendCode: false };
	const io: MachineIO = {
		async getFileList() { return []; },
		async downloadText(path) {
			if (fail.download) { throw new Error("download failed"); }
			const text = files.get(path);
			if (text === undefined) { throw new Error("not found"); }
			return text;
		},
		async downloadBlob() { throw new Error("not used"); },
		async upload(path, content) {
			if (fail.upload) { throw new Error("upload failed"); }
			files.set(path, await content.text());
		},
		async deleteFile() { /* not used */ },
		async sendCode(code) {
			if (fail.sendCode) { throw new Error("sendCode failed"); }
			sentCodes.push(code);
			return "ok";
		},
	};
	return { io, files, sentCodes, fail };
}

describe("load", () => {
	it("parses and stores the height map, resetting fileName and any stale overlay", async () => {
		const { io } = fakeIO({ "0:/sys/heightmap.csv": FIXTURE });
		const store = createBedMeshStore(io);

		const result = await store.load();
		expect(result).toBe("loaded");
		expect(store.fileName.value).toBe(DEFAULT_HEIGHTMAP_FILE);
		expect(store.loaded.value?.rows[0][0]).toBe(0.1);
		expect(store.dirty.value).toBe(false);
	});

	it("loads a non-default filename when given one", async () => {
		const { io } = fakeIO({ "0:/sys/other.csv": FIXTURE });
		const store = createBedMeshStore(io);
		await store.load("other.csv");
		expect(store.fileName.value).toBe("other.csv");
	});

	it("reports not-found without throwing when the file is missing", async () => {
		const { io } = fakeIO();
		const store = createBedMeshStore(io);
		await expect(store.load()).resolves.toBe("not-found");
		expect(store.loaded.value).toBeNull();
	});

	it("reports invalid for a file that isn't a real height map", async () => {
		const { io } = fakeIO({ "0:/sys/heightmap.csv": "not a heightmap" });
		const store = createBedMeshStore(io);
		await expect(store.load()).resolves.toBe("invalid");
		expect(store.loaded.value).toBeNull();
	});
});

describe("valueAt / setValue / discard", () => {
	async function loadedStore() {
		const { io } = fakeIO({ "0:/sys/heightmap.csv": FIXTURE });
		const store = createBedMeshStore(io);
		await store.load();
		return store;
	}

	it("reads through to the loaded map when there is no pending edit", async () => {
		const store = await loadedStore();
		expect(store.valueAt(0, 0)).toBe(0.1);
		expect(store.valueAt(1, 2)).toBeNull(); // unprobed in the fixture
	});

	it("an edit shadows the loaded value without touching it", async () => {
		const store = await loadedStore();
		store.setValue(1, 2, 0.075);
		expect(store.valueAt(1, 2)).toBe(0.075);
		expect(store.loaded.value?.rows[1][2]).toBeNull(); // untouched
		expect(store.dirty.value).toBe(true);
	});

	it("discard drops every pending edit and cannot half-fail (nothing to roll back)", async () => {
		const store = await loadedStore();
		store.setValue(0, 0, 0.5);
		store.setValue(1, 1, 0.6);
		store.discard();
		expect(store.dirty.value).toBe(false);
		expect(store.valueAt(0, 0)).toBe(0.1);
		expect(store.valueAt(1, 1)).toBe(0.2);
	});

	it("liveStats reflects pending edits before they're saved", async () => {
		const store = await loadedStore();
		expect(store.liveStats.value?.probedCount).toBe(5);
		store.setValue(1, 2, 0.4); // was the fixture's unprobed cell
		expect(store.liveStats.value?.probedCount).toBe(6);
		expect(store.liveStats.value?.max).toBeCloseTo(0.4, 6);
	});
});

describe("save", () => {
	async function loadedStore(fail?: Partial<{ upload: boolean; sendCode: boolean }>) {
		const fake = fakeIO({ "0:/sys/heightmap.csv": FIXTURE });
		Object.assign(fake.fail, fail);
		const store = createBedMeshStore(fake.io);
		await store.load();
		return { store, ...fake };
	}

	it("reports not-loaded when nothing has been loaded yet", async () => {
		const { io } = fakeIO();
		const store = createBedMeshStore(io);
		await expect(store.save()).resolves.toBe("not-loaded");
	});

	it("uploads the merged map and reloads it as one operation", async () => {
		const { store, files, sentCodes } = await loadedStore();
		store.setValue(1, 2, 0.4);

		const result = await store.save();

		expect(result).toBe("saved");
		expect(store.dirty.value).toBe(false);
		expect(files.get("0:/sys/heightmap.csv")).toContain("  0.400\n");
		// The bare filename, not a full path - RRF resolves the P parameter against sys itself.
		expect(sentCodes).toEqual(['G29 S1 P"heightmap.csv"']);
	});

	it("edits become the new loaded baseline once save succeeds", async () => {
		const { store } = await loadedStore();
		store.setValue(1, 2, 0.4);
		await store.save();
		expect(store.loaded.value?.rows[1][2]).toBe(0.4);
	});

	// Nothing on the card changed - the overlay must survive so Save can simply be retried.
	it("upload failure reports upload-failed and leaves the edit pending", async () => {
		const { store } = await loadedStore({ upload: true });
		store.setValue(1, 2, 0.4);

		await expect(store.save()).resolves.toBe("upload-failed");
		expect(store.dirty.value).toBe(true);
		expect(store.valueAt(1, 2)).toBe(0.4);
		expect(store.loaded.value?.rows[1][2]).toBeNull(); // NOT promoted - upload never happened
	});

	// The file WAS written, but the machine never reloaded it - the exact state that must not be
	// reported as success. dirty must stay true so the operator can see it isn't done, and loaded must
	// NOT be updated (the machine is still compensating with the old map, not this one).
	it("reload failure reports reload-failed and does not mark the save clean", async () => {
		const { store, files } = await loadedStore({ sendCode: true });
		store.setValue(1, 2, 0.4);

		const result = await store.save();

		expect(result).toBe("reload-failed");
		expect(store.dirty.value).toBe(true);
		expect(files.get("0:/sys/heightmap.csv")).toContain("  0.400\n"); // the upload half DID land
		expect(store.loaded.value?.rows[1][2]).toBeNull(); // but the store does not claim it's live
	});
});
