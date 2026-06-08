/**
 * VENDORED SHARED MODULE — a byte-identical copy lives in the sibling DWC plugins (FlexibleLayouts
 * `src/util/diagnostics.ts` and OmBrowser `src/diagnostics.ts`). Keep them in sync; if a third plugin
 * needs it, promote to a small published runtime package.
 *
 * Captures errors and builds a privacy-scrubbed, user-downloadable diagnostic report so a user whose
 * plugin misbehaves can attach concrete data to a bug report. This is RUNTIME code that ships in the
 * plugin bundle — it does NOT depend on the dev-only dwc-plugin-test-kit. The payoff loop: a captured
 * report's `model` + `state` replay straight into a kit mount test (loadObjectModel(report.model) +
 * mount the failing component) to reproduce and lock the fix.
 */

export interface DiagEntry { time: string; source: string; message: string; stack?: string }

export interface DiagReport {
	generatedAt: string;
	plugin: { id: string; version: string };
	dwcVersion: string;
	firmware: { name: string; version: string };
	environment: { userAgent: string; viewport: string; url: string };
	errors: Array<DiagEntry>;
	state?: unknown;
	model?: unknown;
	note?: string;
}

const MAX_ERRORS = 25;
const buffer: Array<DiagEntry> = [];

/** Push an error into the ring buffer (last 25). Call from catch sites / error boundaries. */
export function recordError(source: string, err: unknown): void {
	const e = err as { message?: string; stack?: string } | undefined;
	buffer.push({
		time: new Date().toISOString(),
		source,
		message: e && e.message ? e.message : String(err),
		stack: e && e.stack ? String(e.stack).split("\n").slice(0, 12).join("\n") : undefined,
	});
	while (buffer.length > MAX_ERRORS) buffer.shift();
}

export function getErrors(): Array<DiagEntry> { return [...buffer]; }
export function clearErrors(): void { buffer.length = 0; }

/**
 * Attach global `error` + `unhandledrejection` listeners that feed the buffer. Returns an uninstall
 * function — call it on plugin unload so a reload doesn't stack duplicate listeners.
 */
export function installErrorCapture(): () => void {
	const onError = (ev: ErrorEvent) => recordError("window.onerror", ev.error ?? ev.message);
	const onRejection = (ev: PromiseRejectionEvent) => recordError("unhandledrejection", ev.reason);
	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onRejection);
	return () => {
		window.removeEventListener("error", onError);
		window.removeEventListener("unhandledrejection", onRejection);
	};
}

const REDACTED = "<redacted>";

function mapReplacer(_key: string, value: unknown): unknown {
	return value instanceof Map ? Object.fromEntries(value as Map<string, unknown>) : value;
}

function deepClone<T>(value: T): T {
	try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value, mapReplacer)) as T; }
}

/**
 * Deep-clone an object model and redact privacy-sensitive values (IP/SSID/MAC, hostnames, board
 * serials, G-code file names) while keeping the structure intact. Returned object is safe to share.
 */
export function sanitizeModel(model: unknown): unknown {
	if (!model || typeof model !== "object") return model;
	const clone = deepClone(model) as Record<string, any>;
	const net = clone.network;
	if (net && typeof net === "object") {
		if (net.hostname) net.hostname = REDACTED;
		if (net.name) net.name = REDACTED;
		if (Array.isArray(net.interfaces)) {
			for (const i of net.interfaces) {
				if (!i || typeof i !== "object") continue;
				for (const k of ["actualIP", "configuredIP", "gateway", "subnet", "dnsServer", "mac", "ssid"]) {
					if (k in i) i[k] = REDACTED;
				}
			}
		}
	}
	if (Array.isArray(clone.boards)) for (const b of clone.boards) { if (b && b.uniqueId) b.uniqueId = REDACTED; }
	const job = clone.job;
	if (job && typeof job === "object") {
		if (job.lastFileName) job.lastFileName = REDACTED;
		if (job.file && job.file.fileName) job.file.fileName = REDACTED;
	}
	return clone;
}

function installedPluginRecord(model: any, pluginId: string): { version?: string; dwcVersion?: string } | undefined {
	const plugins = model && model.plugins;
	if (!plugins) return undefined;
	return plugins instanceof Map ? plugins.get(pluginId) : plugins[pluginId];
}

function probeDwcVersion(): string {
	try { return (globalThis as { DWC?: { version?: string } }).DWC?.version ?? "unknown"; } catch { return "unknown"; }
}

/**
 * Assemble a diagnostic report. Versions are read from the object model's `plugins[id]` record when
 * available (the authoritative installed version), falling back to a probe / "unknown". Pass the live
 * `model` (it is sanitised) and optionally `state` (e.g. the config of the component that failed).
 */
export function buildReport(opts: {
	pluginId: string;
	model?: unknown;
	state?: unknown;
	note?: string;
	pluginVersion?: string;
}): DiagReport {
	const model = opts.model as Record<string, any> | undefined;
	const board = model && Array.isArray(model.boards) ? model.boards[0] : undefined;
	const installed = installedPluginRecord(model, opts.pluginId);
	return {
		generatedAt: new Date().toISOString(),
		plugin: { id: opts.pluginId, version: opts.pluginVersion ?? installed?.version ?? "unknown" },
		dwcVersion: installed?.dwcVersion ?? probeDwcVersion(),
		firmware: {
			name: (board && board.firmwareName) || "unknown",
			version: (board && board.firmwareVersion) || "unknown",
		},
		environment: {
			userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
			viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown",
			// Strip the query string — it can carry plugin state (e.g. OmBrowser's ?path=).
			url: typeof location !== "undefined" ? location.href.split("?")[0] : "unknown",
		},
		errors: getErrors(),
		state: opts.state,
		model: opts.model ? sanitizeModel(opts.model) : undefined,
		note: opts.note,
	};
}

export function reportToJson(report: DiagReport): string {
	try { return JSON.stringify(report, mapReplacer, 2); } catch { return JSON.stringify({ error: "serialization failed", plugin: report.plugin }, null, 2); }
}

/** Trigger a browser download of the report as a JSON file. */
export function downloadReport(report: DiagReport, filename?: string): void {
	const name = filename || `${report.plugin.id}-diagnostics-${report.generatedAt.replace(/[:.]/g, "-")}.json`;
	const blob = new Blob([reportToJson(report)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy the report JSON to the clipboard. Tries execCommand first (works on plain-HTTP Duets). */
export async function copyReport(report: DiagReport): Promise<boolean> {
	const text = reportToJson(report);
	try {
		const el = document.createElement("textarea");
		el.value = text;
		el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
		document.body.appendChild(el);
		el.focus();
		el.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(el);
		if (ok) return true;
	} catch { /* fall through to the async clipboard API */ }
	try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } } catch { /* ignore */ }
	return false;
}
