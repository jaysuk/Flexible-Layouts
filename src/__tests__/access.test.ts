import { beforeEach, describe, expect, it } from "vitest";

import { useSettingsStore } from "@/stores/settings";

import {
	accessLockedFor,
	availableLogins,
	can,
	currentLevel,
	defaultLevel,
	getAccess,
	hashPassword,
	isAccessEnabled,
	loginAsAdmin,
	loginAsOperator,
	markAdmin,
	relock,
	requestAdmin,
	requestElevation,
	setAccess,
	type AccessConfig,
} from "../model/access";

function cfg(patch: Partial<AccessConfig> = {}): AccessConfig {
	return { observerEnabled: false, operatorEnabled: false, adminHash: "", operatorHash: "", hideEmergencyStop: false, ...patch };
}

// `sessionLevel` is a module-level ref, not part of the kit's reset-per-test `dwc` state, so it must
// be dropped explicitly between tests (the settings store IS reset automatically by the kit).
beforeEach(() => relock());

describe("defaultLevel / isAccessEnabled", () => {
	it("is admin/disabled when nothing is configured", () => {
		setAccess(cfg());
		expect(defaultLevel()).toBe("admin");
		expect(isAccessEnabled()).toBe(false);
	});
	it("is observer when only Observer is enabled", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: "h" }));
		expect(defaultLevel()).toBe("observer");
		expect(isAccessEnabled()).toBe(true);
	});
	it("is operator when only Operator is enabled", () => {
		setAccess(cfg({ operatorEnabled: true, adminHash: "h" }));
		expect(defaultLevel()).toBe("operator");
		expect(isAccessEnabled()).toBe(true);
	});
	it("is observer (most restrictive) when both are enabled", () => {
		setAccess(cfg({ observerEnabled: true, operatorEnabled: true, adminHash: "h", operatorHash: "o" }));
		expect(defaultLevel()).toBe("observer");
	});
});

describe("capabilities per level", () => {
	it("observer can do nothing", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: "h" }));
		for (const capability of ["interact", "runJobs", "manageFiles", "editConfig", "editLayout", "leaveLayout"] as const) {
			expect(can(capability)).toBe(false);
		}
	});
	it("operator can interact/runJobs but nothing else", () => {
		setAccess(cfg({ operatorEnabled: true, adminHash: "h" }));
		expect(can("interact")).toBe(true);
		expect(can("runJobs")).toBe(true);
		expect(can("manageFiles")).toBe(false);
		expect(can("editConfig")).toBe(false);
		expect(can("editLayout")).toBe(false);
		expect(can("leaveLayout")).toBe(false);
	});
	it("admin can do everything", () => {
		setAccess(cfg());
		expect(currentLevel()).toBe("admin");
		for (const capability of ["interact", "runJobs", "manageFiles", "editConfig", "editLayout", "leaveLayout"] as const) {
			expect(can(capability)).toBe(true);
		}
	});
});

describe("accessLockedFor", () => {
	it("locks everything when interact is missing", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: "h" }));
		expect(accessLockedFor({ type: "jog" })).toBe(true);
		expect(accessLockedFor({ type: "builtinPanel", component: "StatusPanel" })).toBe(true);
	});
	it("Operator (has interact) is still locked out of FileList/JobFileList specifically", () => {
		setAccess(cfg({ operatorEnabled: true, adminHash: "h" }));
		expect(accessLockedFor({ type: "jog" })).toBe(false);
		expect(accessLockedFor({ type: "builtinPanel", component: "FileList" })).toBe(true);
		expect(accessLockedFor({ type: "builtinPanel", component: "JobFileList" })).toBe(true);
		expect(accessLockedFor({ type: "builtinPanel", component: "StatusPanel" })).toBe(false);
	});
	it("Admin is never locked", () => {
		setAccess(cfg());
		expect(accessLockedFor({ type: "builtinPanel", component: "FileList" })).toBe(false);
	});
});

describe("login", () => {
	it("Operator login only succeeds when BOTH tiers are enabled and the hash matches", () => {
		// Operator-only config: no separate Operator password exists — always fails.
		setAccess(cfg({ operatorEnabled: true, adminHash: hashPassword("admin"), operatorHash: hashPassword("op") }));
		expect(loginAsOperator("op")).toBe(false);
		expect(currentLevel()).toBe("operator"); // still the baseline, not elevated

		// Both enabled: the correct Operator password elevates; matches admin's own hash otherwise stays observer.
		setAccess(cfg({ observerEnabled: true, operatorEnabled: true, adminHash: hashPassword("admin"), operatorHash: hashPassword("op") }));
		expect(currentLevel()).toBe("observer");
		expect(loginAsOperator("wrong")).toBe(false);
		expect(currentLevel()).toBe("observer");
		expect(loginAsOperator("op")).toBe(true);
		expect(currentLevel()).toBe("operator");
	});

	it("Admin login always works with the right password, regardless of tiers", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: hashPassword("secret") }));
		expect(loginAsAdmin("wrong")).toBe(false);
		expect(currentLevel()).toBe("observer");
		expect(loginAsAdmin("secret")).toBe(true);
		expect(currentLevel()).toBe("admin");
	});

	it("Admin can be reached directly from Observer, skipping Operator", () => {
		setAccess(cfg({ observerEnabled: true, operatorEnabled: true, adminHash: hashPassword("secret"), operatorHash: hashPassword("op") }));
		expect(loginAsAdmin("secret")).toBe(true);
		expect(currentLevel()).toBe("admin");
	});

	it("relock() returns to the baseline", () => {
		setAccess(cfg({ operatorEnabled: true, adminHash: hashPassword("secret") }));
		loginAsAdmin("secret");
		expect(currentLevel()).toBe("admin");
		relock();
		expect(currentLevel()).toBe("operator");
	});

	it("markAdmin() elevates without a password (used right after configuring)", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: hashPassword("secret") }));
		markAdmin();
		expect(currentLevel()).toBe("admin");
	});
});

describe("availableLogins", () => {
	it("offers only Admin when a single tier is enabled", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: "h" }));
		expect(availableLogins()).toEqual(["admin"]);
		setAccess(cfg({ operatorEnabled: true, adminHash: "h" }));
		expect(availableLogins()).toEqual(["admin"]);
	});
	it("offers Operator and Admin from Observer when both tiers are enabled", () => {
		setAccess(cfg({ observerEnabled: true, operatorEnabled: true, adminHash: "h", operatorHash: "o" }));
		expect(availableLogins()).toEqual(["operator", "admin"]);
	});
	it("offers only Admin once already elevated to Operator", () => {
		setAccess(cfg({ observerEnabled: true, operatorEnabled: true, adminHash: hashPassword("secret"), operatorHash: hashPassword("op") }));
		loginAsOperator("op");
		expect(availableLogins()).toEqual(["admin"]);
	});
	it("offers nothing once at Admin", () => {
		setAccess(cfg({ observerEnabled: true, adminHash: hashPassword("secret") }));
		loginAsAdmin("secret");
		expect(availableLogins()).toEqual([]);
	});
});

describe("requestElevation / requestAdmin", () => {
	it("resolve immediately true when already Admin (no lock configured)", async () => {
		setAccess(cfg());
		await expect(requestElevation()).resolves.toBe(true);
		await expect(requestAdmin()).resolves.toBe(true);
	});
});

describe("migration from the legacy {enabled, hash} lock", () => {
	// No public API writes the legacy `lock` key (only `access`), so these tests write it directly
	// through the same settings container `getAccess()` reads from, mimicking a pre-upgrade save.
	function writeLegacyLock(legacy: { enabled: boolean; hash: string }): void {
		const settings = useSettingsStore() as unknown as { plugins: Record<string, Record<string, unknown>> };
		settings.plugins.flexibleLayouts = { lock: legacy };
	}

	it("maps an active legacy lock to Operator-only, with the old password becoming Admin's", () => {
		const legacyHash = hashPassword("legacy-pw");
		writeLegacyLock({ enabled: true, hash: legacyHash });
		const migrated = getAccess();
		expect(migrated.observerEnabled).toBe(false);
		expect(migrated.operatorEnabled).toBe(true);
		expect(migrated.adminHash).toBe(legacyHash);
		expect(migrated.operatorHash).toBe("");
		expect(defaultLevel()).toBe("operator");
		// The migrated Admin password is exactly the old lock password.
		expect(loginAsAdmin("legacy-pw")).toBe(true);
	});

	it("treats a disabled legacy lock as fully unconfigured", () => {
		writeLegacyLock({ enabled: false, hash: "" });
		expect(getAccess()).toEqual(cfg());
		expect(defaultLevel()).toBe("admin");
	});

	it("treats an enabled-but-empty-hash legacy lock (corrupted/interrupted save) as unconfigured, never a blank-password Admin login", () => {
		writeLegacyLock({ enabled: true, hash: "" });
		const migrated = getAccess();
		expect(migrated).toEqual(cfg());
		expect(loginAsAdmin("")).toBe(false);
	});
});
