import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, setFiles, setModel } from "dwc-plugin-test-kit";
import {
	configureHost, getBackedUpMachineKeys, getLastBackupAt, getLastBackupAttempt, resetForTests, resetHostConfigForTests,
} from "dwc-config-backup-core";

import { collectForBackup, runBackup } from "../model/configBackup/runBackup";
import type { RunBackupConfig } from "../model/configBackup/runBackup";

// Matches the real production namespace from this repo's own configureHost() call in index.ts - see
// test/configBackup.migrate.test.ts for the same convention.
const FL_NAMESPACE = "flexibleLayouts.configBackup";

let sysConfigG: string | null = null;
// The test-kit's machine stub doesn't implement download() (see CLAUDE.md) - wrap the real stub and
// add just enough of one to serve a single fixed 0:/sys/config.g body when a test sets `sysConfigG`.
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return {
				...real,
				async download(options: { filename: string; type: string }) {
					if (options.filename === "0:/sys/config.g" && sysConfigG != null) { return sysConfigG; }
					throw new Error("not found");
				},
			};
		},
	};
});

// object-model-only: the one scope collectAll() can satisfy with zero machine I/O (no directory to
// walk, no file to read - see collect.ts's collectAll, object model comes straight from the live
// model already in the store). Keeps most of these tests free of file-list/download mocking.
const OBJECT_MODEL_ONLY_SCOPE = { system: false, macros: false, filaments: false, objectModel: true, diagnostics: false };
const SYSTEM_ONLY_SCOPE = { system: true, macros: false, filaments: false, objectModel: false, diagnostics: false };

function baseConfig(overrides: Partial<RunBackupConfig> = {}): RunBackupConfig {
	return { destination: "local", scope: OBJECT_MODEL_ONLY_SCOPE, redact: false, encrypt: false, ...overrides };
}

beforeEach(() => {
	resetForTests();
	resetHostConfigForTests();
	configureHost({ storageNamespace: FL_NAMESPACE });
	sysConfigG = null;
	setModel(loadObjectModel());
});

describe("runBackup - needsInput, never hangs (SCHEDULED-BACKUPS-PLAN.md §7)", () => {
	it("returns needsInput 'encryptPassword' rather than proceeding when encryption is on with no password", async () => {
		const prepared = await collectForBackup(OBJECT_MODEL_ONLY_SCOPE);
		const res = await runBackup(prepared, baseConfig({ encrypt: true }));
		expect(res.ok).toBe(false);
		expect(!res.ok && res.reason).toBe("needsInput");
		expect(!res.ok && res.reason === "needsInput" && res.needsInputKind).toBe("encryptPassword");
	});

	it("returns needsInput 'unredacted', naming the sensitive entries, for a non-local unacknowledged destination", async () => {
		sysConfigG = 'M551 P"supersecret"\n'; // Tier-1 machine password (sanitise.ts)
		setFiles("0:/sys/", [{ name: "config.g", isDirectory: false }]);
		const prepared = await collectForBackup(SYSTEM_ONLY_SCOPE);
		const res = await runBackup(prepared, baseConfig({ destination: "github", scope: SYSTEM_ONLY_SCOPE }));
		expect(res.ok).toBe(false);
		expect(!res.ok && res.reason).toBe("needsInput");
		if (!res.ok && res.reason === "needsInput") {
			expect(res.needsInputKind).toBe("unredacted");
			expect(res.unredactedEntries?.length).toBeGreaterThan(0);
		}
	});

	it("does not record an attempt for a needsInput result - a run that never started isn't an attempt", async () => {
		const prepared = await collectForBackup(OBJECT_MODEL_ONLY_SCOPE);
		await runBackup(prepared, baseConfig({ encrypt: true }));
		expect(getLastBackupAttempt()).toBeNull();
	});

	it("a retry with redact:true (as the caller does after 'redact instead') moves past the SAME check, reusing the collected data", async () => {
		sysConfigG = 'M551 P"supersecret"\n';
		setFiles("0:/sys/", [{ name: "config.g", isDirectory: false }]);
		const prepared = await collectForBackup(SYSTEM_ONLY_SCOPE);
		const first = await runBackup(prepared, baseConfig({ destination: "github", scope: SYSTEM_ONLY_SCOPE }));
		expect(!first.ok && first.reason).toBe("needsInput");
		// github isn't configured in this test, so the retry can't succeed all the way to a real push -
		// but it must get PAST the unredacted gate (redact:true skips it) and fail for a DIFFERENT reason
		// (missing settings), proving the retry used the same `prepared` rather than re-triggering it.
		const retried = await runBackup(prepared, baseConfig({ destination: "github", scope: SYSTEM_ONLY_SCOPE, redact: true }));
		expect(!retried.ok && retried.reason).toBe("failed");
	});
});

describe("runBackup - success records lastBackupAt/backedUpMachineKeys/lastBackupAttempt identically to a manual run", () => {
	it("downloading locally succeeds and records all three", async () => {
		const prepared = await collectForBackup(OBJECT_MODEL_ONLY_SCOPE);
		const res = await runBackup(prepared, baseConfig());
		expect(res.ok).toBe(true);
		expect(getLastBackupAt()).not.toBeNull();
		expect(getBackedUpMachineKeys().length).toBe(1);
		expect(getLastBackupAttempt()).toEqual(expect.objectContaining({ ok: true, destination: "local" }));
	});
});

describe("runBackup - a real failure records a failed attempt WITHOUT touching lastBackupAt (§4.4)", () => {
	it("an unconfigured destination fails, is recorded, and lastBackupAt stays null", async () => {
		const prepared = await collectForBackup(OBJECT_MODEL_ONLY_SCOPE);
		const res = await runBackup(prepared, baseConfig({ destination: "github" }));
		expect(res.ok).toBe(false);
		expect(!res.ok && res.reason).toBe("failed");
		expect(getLastBackupAt()).toBeNull(); // success-only - a failure must never fake "recently backed up"
		const attempt = getLastBackupAttempt();
		expect(attempt?.ok).toBe(false);
		expect(attempt?.destination).toBe("github");
		expect(attempt?.message).toBeTruthy();
	});
});
