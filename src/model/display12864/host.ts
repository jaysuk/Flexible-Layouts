/**
 * The `MenuHost` (dwc-gcode-core) behind the emulator: menu files from a preloaded {@link MenuSource},
 * live values and visibility from the object model, directory listings fetched from the SD card on demand,
 * and - deliberately - G-code that is only *recorded*, never sent. The emulator exists to check a menu
 * file while editing it; a button that homes the printer or heats a bed must not do so from a preview.
 */
import type { MenuHost } from "dwc-gcode-core";

import { type MenuIO, type MenuSource } from "./menuSource";
import { evaluateMenuCondition, evaluateMenuValue, legacyValue, visibilityCode } from "./liveValues";

export interface EmulatorHostOptions {
	source: MenuSource;
	/** The current object model (read fresh on every question, so values follow the machine). */
	model: () => Record<string, unknown>;
	/** Lists directories for `files` items; without it those lists are empty. */
	io?: Pick<MenuIO, "getFileList">;
	/** Called with each command the display would have sent. */
	onCommand?: (command: string) => void;
	/** Milliseconds; for tests. */
	now?: () => number;
}

/** RRF paths are on volume 0 unless they say otherwise: `/gcodes` is `0:/gcodes`. */
export function sdPath(path: string): string {
	return /^\d+:/.test(path) ? path : `0:${path.startsWith("/") ? "" : "/"}${path}`;
}

export function createEmulatorHost(options: EmulatorHostOptions): MenuHost {
	const { source, model } = options;
	// Listings by normalised directory; `null` while a fetch is in flight (the display waits and asks again).
	const listings = new Map<string, Array<{ name: string; isDirectory: boolean }> | null>();

	return {
		readMenuFile: (name) => source.files.get(name.toLowerCase()),
		readImage: (name) => source.images.get(name.toLowerCase()),

		listDirectory(path) {
			const dir = sdPath(path).replace(/\/+$/, "");
			const cached = listings.get(dir);
			if (cached === null) return undefined;
			if (cached !== undefined) return cached;
			if (!options.io) return [];
			listings.set(dir, null);
			options.io.getFileList(dir)
				.then((entries) => listings.set(dir, entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }))))
				.catch(() => listings.set(dir, [])); // unreadable: shows as empty rather than hanging
			return undefined;
		},

		sdMounted: () => (model().volumes as Array<{ mounted?: boolean }> | undefined)?.[0]?.mounted !== false,
		visibilityCode: (code) => visibilityCode(model(), code),
		evaluateCondition: (expression) => evaluateMenuCondition(model(), expression),
		evaluateValue: (expression) => evaluateMenuValue(model(), expression),
		legacyValue: (code) => legacyValue(model(), code),

		// Adjusting a value on the preview only changes what the preview shows for that turn; nothing is committed.
		execute: (command) => {
			options.onCommand?.(command);
			return true;
		},
		now: options.now,
	};
}
