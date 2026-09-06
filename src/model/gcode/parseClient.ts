/**
 * Main-thread client for the G-code parser worker. Lazily creates one worker (via DWC's
 * pluginAssetUrl(), see parseWorker.ts's doc comment for why) and reuses it across calls. If the
 * worker asset can't be created for any reason - a strict CSP, an older DWC build, the
 * Vitest/happy-dom test environment which has no Worker global at all - this falls back to running
 * parseGcode() synchronously on the caller's own thread: slower on huge files, never a hard failure.
 */
import { pluginAssetUrl } from "@/plugins";

import { parseGcode, type ParseResult } from "./parse";

const WORKER_ASSET_PATH = "js/flexible-layouts-gcode-parse.worker.js";

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (r: ParseResult) => void; reject: (e: Error) => void }>();

function failAllPending(message: string): void {
	for (const { reject } of pending.values()) {
		reject(new Error(message));
	}
	pending.clear();
}

function getWorker(): Worker | null {
	if (workerFailed) {
		return null;
	}
	if (worker) {
		return worker;
	}
	if (typeof Worker === "undefined") {
		workerFailed = true;
		return null;
	}
	try {
		const w = new Worker(pluginAssetUrl(WORKER_ASSET_PATH));
		w.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: ParseResult; error?: string }>) => {
			const { id, ok, result, error } = ev.data;
			const entry = pending.get(id);
			if (!entry) {
				return;
			}
			pending.delete(id);
			if (ok && result) {
				entry.resolve(result);
			} else {
				entry.reject(new Error(error ?? "G-code parse failed"));
			}
		};
		w.onerror = () => {
			// The asset failed to load/execute (404, CSP, ...) - stop trying it for the rest of this
			// session; every in-flight and future call falls back to the synchronous parser instead.
			workerFailed = true;
			failAllPending("G-code parser worker failed to load");
			worker = null;
		};
		worker = w;
	} catch {
		workerFailed = true;
		return null;
	}
	return worker;
}

/** Parse G-code off the main thread when possible; synchronously (blocking) otherwise. */
export function parseGcodeAsync(text: string): Promise<ParseResult> {
	// Callers get their text from `machineStore.download(..., type: "text")` and cast it `as string`,
	// so a backend that answers with no body hands us `undefined` and the parser dies deep inside on
	// a `.length` read. Reject with something the caller can actually display instead.
	if (typeof text !== "string") {
		return Promise.reject(new Error("G-code file could not be read (empty response)"));
	}
	const w = getWorker();
	if (!w) {
		return Promise.resolve(parseGcode(text));
	}
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, {
			resolve,
			// A worker-side failure still has a synchronous fallback available - use it rather than
			// surfacing the rejection, so a bad worker asset degrades to "slower", not "broken".
			// The retry MUST be guarded: when the worker failed because `text` itself is bad (e.g.
			// undefined, which makes parseGcode throw "Cannot read properties of undefined"), running
			// the identical parse again here throws the identical error - and this runs inside the
			// worker's own `onmessage`, so the throw escaped as an uncaught error AND left this
			// promise permanently unsettled, hanging every caller that awaited it forever.
			reject: () => {
				try {
					resolve(parseGcode(text));
				} catch (e) {
					reject(e instanceof Error ? e : new Error(String(e)));
				}
			},
		});
		w.postMessage({ id, text });
	});
}
