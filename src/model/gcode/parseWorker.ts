/**
 * Web Worker entry for the G-code geometry parser. Built as a STANDALONE script by
 * scripts/build-gcode-worker.mjs (esbuild, IIFE) - the main plugin bundle is itself IIFE-format
 * (DWC's build-plugin-pkg.js forces this) and Vite's native `new Worker(new URL(...))` chunking does
 * not survive that: verified empirically that import.meta.url is zeroed under iife output and the
 * emitted worker chunk lands outside dwcFiles, so the loader never deploys it. This ships instead as
 * its own asset under dwc/js/, referenced at runtime via DWC's pluginAssetUrl() - see parseClient.ts.
 *
 * Deliberately has zero DWC/Vue imports (parse.ts is itself dependency-free) - this file is bundled
 * on its own by esbuild, not through DWC's `window.DWC` externalisation, so nothing from the host app
 * is available to it.
 */
import { parseGcode, type ParseResult } from "./parse";

interface ParseRequest {
	id: number;
	text: string;
}
type ParseResponse =
	| { id: number; ok: true; result: ParseResult }
	| { id: number; ok: false; error: string };

interface WorkerScope {
	onmessage: ((ev: { data: unknown }) => void) | null;
	postMessage: (msg: ParseResponse) => void;
}
const scope = self as unknown as WorkerScope;

function isParseRequest(data: unknown): data is ParseRequest {
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as ParseRequest).id === "number" &&
		typeof (data as ParseRequest).text === "string"
	);
}

// DWC's plugin loader injects EVERY `.js` listed in a manifest's `dwcFiles` as a classic <script>
// (plugins/index.ts), and this file is one of them, so it also runs on the page's main thread - where
// `self` is `window`. Wiring `onmessage` there is not harmless: the reply below is then a same-window
// postMessage that lands in this very handler, which fails on the reply's shape and posts another
// error reply, forever (one profile showed 1.35 million calls in 9 s). So only act inside a real
// Worker, and never answer anything that is not a request.
const workerGlobalScope = (globalThis as { WorkerGlobalScope?: new () => unknown }).WorkerGlobalScope;
const inWorker = typeof workerGlobalScope === "function" && self instanceof workerGlobalScope;

if (inWorker) {
	scope.onmessage = (ev) => {
		if (!isParseRequest(ev.data)) {
			return;
		}
		const { id, text } = ev.data;
		try {
			const result = parseGcode(text);
			scope.postMessage({ id, ok: true, result });
		} catch (e) {
			scope.postMessage({ id, ok: false, error: (e as Error)?.message ?? String(e) });
		}
	};
}
