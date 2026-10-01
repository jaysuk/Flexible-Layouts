import { beforeEach, describe, expect, it } from "vitest";

import {
	emptyRulesDoc, loadMaintenanceRules, parseRulesDoc, serializeRulesDoc, updateMaintenanceRules, type MaintenanceRulesDoc,
	type RulesIO,
} from "../model/reminders/rulesStore";
import { getIntervalRules, hasMigratedRules, setIntervalRules, type MaintenanceIntervalRule } from "../model/reminders/storage";

// Same working-localStorage workaround as reminders.storage.test.ts (this environment's is non-functional).
function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
		setItem: (k: string, v: string) => { map.set(k, v); },
		removeItem: (k: string) => { map.delete(k); },
		clear: () => { map.clear(); },
		key: (i: number) => [...map.keys()][i] ?? null,
		get length() { return map.size; },
	} as Storage;
}

beforeEach(() => {
	Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
});

const rule = (id: string, over: Partial<MaintenanceIntervalRule> = {}): MaintenanceIntervalRule => ({
	id, label: `rule ${id}`, counter: "spindleSeconds", intervalValue: 3600, enabled: true, ...over,
});

/** A card holding at most one file, with switches for the failure modes the store has to survive. */
interface FakeCard {
	text: string | null;
	writes: number;
	failRead: boolean;
	failWrite: boolean;
	corruptWrite: boolean;
	existsAnswer: boolean | null | "auto";
	io: RulesIO;
}

function fakeCard(initial: string | null = null) {
	const card: FakeCard = {
		text: initial,
		writes: 0,
		failRead: false,
		failWrite: false,
		corruptWrite: false,
		existsAnswer: null,
		io: {
			async read() {
				if (card.failRead || card.text === null) { throw new Error("no file"); }
				return card.text;
			},
			async write(text: string) {
				if (card.failWrite) { throw new Error("write failed"); }
				card.writes++;
				card.text = card.corruptWrite ? text.slice(0, Math.floor(text.length / 2)) : text;
			},
			async exists() { return card.existsAnswer === "auto" ? card.text !== null : card.existsAnswer; },
		},
	};
	card.existsAnswer = "auto";
	return card;
}

const doc = (over: Partial<MaintenanceRulesDoc> = {}): MaintenanceRulesDoc => ({ ...emptyRulesDoc(), ...over });

describe("rules file format", () => {
	it("round-trips rules, user counters and the id counter with a valid checksum", () => {
		const d = doc({
			rules: [rule("a", { action: 'M291 P"x" S1', actionWhenIdle: false })],
			customCounters: [{ id: "c1", title: "Tool 1", conditions: ["state.currentTool == 1"] }], nextCustomId: 2,
		});
		const parsed = parseRulesDoc(serializeRulesDoc(d));
		expect(parsed?.integrity).toBe("ok");
		expect(parsed?.doc).toEqual(d);
	});

	it("detects a file that no longer matches its own checksum", () => {
		const obj = JSON.parse(serializeRulesDoc(doc({ rules: [rule("a")] })));
		obj.rules[0].intervalValue = 1;
		expect(parseRulesDoc(JSON.stringify(obj))?.integrity).toBe("mismatch");
	});

	it("reads a file without a checksum as 'none', not a mismatch", () => {
		const obj = JSON.parse(serializeRulesDoc(doc()));
		delete obj.checksum;
		expect(parseRulesDoc(JSON.stringify(obj))?.integrity).toBe("none");
	});

	it("rejects anything that is not a rules file, and drops malformed entries individually", () => {
		expect(parseRulesDoc("not json")).toBeNull();
		expect(parseRulesDoc("[]")).toBeNull();
		expect(parseRulesDoc(JSON.stringify({ kind: "something-else", rules: [] }))).toBeNull();
		const parsed = parseRulesDoc(JSON.stringify({
			kind: "flexible-layouts-maintenance-rules", rules: [rule("a"), { junk: true }],
			customCounters: [{ id: "c1", title: "ok", conditions: [] }, { id: "BAD ID", title: "x", conditions: [] }],
		}));
		expect(parsed?.doc.rules.map((r) => r.id)).toEqual(["a"]);
		expect(parsed?.doc.customCounters.map((c) => c.id)).toEqual(["c1"]);
	});

	it("never lets the id counter fall behind an id already in use, even if the file says so", () => {
		const parsed = parseRulesDoc(JSON.stringify({
			kind: "flexible-layouts-maintenance-rules", rules: [], nextCustomId: 1,
			customCounters: [{ id: "c7", title: "x", conditions: [] }],
		}));
		expect(parsed?.doc.nextCustomId).toBe(8);
	});
});

describe("loadMaintenanceRules", () => {
	it("reads the machine's rules and refreshes the local offline copy", async () => {
		const card = fakeCard(serializeRulesDoc(doc({ rules: [rule("a")] })));
		const loaded = await loadMaintenanceRules(card.io);
		expect(loaded.source).toBe("machine");
		expect(loaded.doc.rules.map((r) => r.id)).toEqual(["a"]);
		expect(getIntervalRules().map((r) => r.id)).toEqual(["a"]);
	});

	describe("migration from the old per-browser rules", () => {
		it("creates the file from this browser's rules when it is positively known to be absent", async () => {
			setIntervalRules([rule("old1"), rule("old2")]);
			const card = fakeCard(null);
			const loaded = await loadMaintenanceRules(card.io);
			expect(loaded.doc.rules.map((r) => r.id)).toEqual(["old1", "old2"]);
			expect(parseRulesDoc(card.text!)?.doc.rules.map((r) => r.id)).toEqual(["old1", "old2"]);
			expect(hasMigratedRules()).toBe(true);
		});

		it("writes nothing for a browser with no local rules and no file", async () => {
			const card = fakeCard(null);
			const loaded = await loadMaintenanceRules(card.io);
			expect(loaded.doc.rules).toEqual([]);
			expect(card.writes).toBe(0);
		});

		it("folds a second browser's local rules into an existing file, once, by id", async () => {
			const card = fakeCard(serializeRulesDoc(doc({ rules: [rule("shared"), rule("dup", { label: "machine copy" })] })));
			setIntervalRules([rule("dup", { label: "local copy" }), rule("mine")]);
			const first = await loadMaintenanceRules(card.io);
			expect(first.doc.rules.map((r) => r.id)).toEqual(["shared", "dup", "mine"]);
			expect(first.doc.rules.find((r) => r.id === "dup")?.label).toBe("machine copy"); // the machine wins a clash
			expect(hasMigratedRules()).toBe(true);

			// A rule deleted on the machine afterwards must not be resurrected from the stale local copy.
			card.text = serializeRulesDoc(doc({ rules: [rule("shared")] }));
			setIntervalRules([rule("mine")]);
			const second = await loadMaintenanceRules(card.io);
			expect(second.doc.rules.map((r) => r.id)).toEqual(["shared"]);
		});
	});

	it("NEVER writes over a file it cannot read: unreadable is not absent", async () => {
		setIntervalRules([rule("local")]);
		const card = fakeCard(serializeRulesDoc(doc({ rules: [rule("on-card")] })));
		card.failRead = true;
		card.existsAnswer = true;
		const loaded = await loadMaintenanceRules(card.io);
		expect(loaded.source).toBe("cache");
		expect(loaded.doc.rules.map((r) => r.id)).toEqual(["local"]);
		expect(card.writes).toBe(0);
	});

	it("does not migrate when the directory listing itself failed (existence unknown)", async () => {
		setIntervalRules([rule("local")]);
		const card = fakeCard(null);
		card.existsAnswer = null;
		const loaded = await loadMaintenanceRules(card.io);
		expect(loaded.source).toBe("cache");
		expect(card.writes).toBe(0);
		expect(hasMigratedRules()).toBe(false);
	});

	it("serves the local copy, read-only, for a file that is not a rules file at all", async () => {
		setIntervalRules([rule("local")]);
		const card = fakeCard("garbage that is on the card");
		const loaded = await loadMaintenanceRules(card.io);
		expect(loaded.source).toBe("cache");
		expect(card.text).toBe("garbage that is on the card");
	});
});

describe("updateMaintenanceRules", () => {
	it("applies the change to the file's CURRENT content, not to whatever was loaded earlier", async () => {
		const card = fakeCard(serializeRulesDoc(doc({ rules: [rule("a")] })));
		await loadMaintenanceRules(card.io);
		// another browser adds a rule in the meantime
		card.text = serializeRulesDoc(doc({ rules: [rule("a"), rule("b")] }));
		const { result, doc: next } = await updateMaintenanceRules((d) => ({ ...d, rules: [...d.rules, rule("c")] }), card.io);
		expect(result).toBe("written");
		expect(next?.rules.map((r) => r.id)).toEqual(["a", "b", "c"]);
		expect(parseRulesDoc(card.text!)?.doc.rules.map((r) => r.id)).toEqual(["a", "b", "c"]);
		expect(getIntervalRules().map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("creates the file on first use, seeded from this browser's old rules", async () => {
		setIntervalRules([rule("old")]);
		const card = fakeCard(null);
		const { result, doc: next } = await updateMaintenanceRules((d) => ({ ...d, rules: [...d.rules, rule("new")] }), card.io);
		expect(result).toBe("written");
		expect(next?.rules.map((r) => r.id)).toEqual(["old", "new"]);
	});

	it("blocks, and leaves the file alone, when its checksum already disagrees with itself", async () => {
		const obj = JSON.parse(serializeRulesDoc(doc({ rules: [rule("a")] })));
		obj.rules[0].label = "hand-edited";
		const card = fakeCard(JSON.stringify(obj));
		const before = card.text;
		const { result } = await updateMaintenanceRules((d) => ({ ...d, rules: [] }), card.io);
		expect(result).toBe("blocked");
		expect(card.text).toBe(before);
		expect(card.writes).toBe(0);
	});

	it("fails, without writing, when the file cannot be read safely", async () => {
		const card = fakeCard(serializeRulesDoc(doc({ rules: [rule("a")] })));
		card.failRead = true;
		card.existsAnswer = true;
		const { result } = await updateMaintenanceRules((d) => d, card.io);
		expect(result).toBe("failed");
		expect(card.writes).toBe(0);
	});

	it("fails when the write errors, and when the write lands corrupted (read-back check)", async () => {
		const failing = fakeCard(null);
		failing.failWrite = true;
		expect((await updateMaintenanceRules((d) => ({ ...d, rules: [rule("a")] }), failing.io)).result).toBe("failed");

		const corrupt = fakeCard(null);
		corrupt.corruptWrite = true;
		expect((await updateMaintenanceRules((d) => ({ ...d, rules: [rule("a")] }), corrupt.io)).result).toBe("failed");
		// ...and the local copy is not updated to something the machine does not have
		expect(getIntervalRules()).toEqual([]);
	});
});
