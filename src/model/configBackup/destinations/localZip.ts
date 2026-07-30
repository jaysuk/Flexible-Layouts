/** Local ZIP download destination - the simplest and always-available option (§6 Phase 3). */
import { downloadBlob } from "dwc-plugin-runtime";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** `FlexibleLayouts-config-<hostname>-<YYYYMMDD-HHmmss>.zip` (§4). */
export function backupFilename(hostname: string, at: Date = new Date()): string {
	const safeHost = hostname.replace(/[^A-Za-z0-9_-]+/g, "_") || "machine";
	const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
	return `FlexibleLayouts-config-${safeHost}-${stamp}.zip`;
}

export function downloadArchive(blob: Blob, hostname: string): void {
	downloadBlob(backupFilename(hostname), blob, "application/zip");
}
