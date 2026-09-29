/**
 * The menu files a 12864 display would read: everything in the printer's `0:/menu/` directory, fetched
 * up front. `MenuDisplay` (dwc-gcode-core) reads files synchronously, so the emulator preloads the (small)
 * directory instead of fetching on demand.
 */
import { classifyFile } from "dwc-gcode-core";

/** Just what loading needs from a machine - satisfied by `dwc-config-backup-core`'s `MachineIO` too. */
export interface MenuIO {
	getFileList(directory: string): Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>>;
	downloadText(filename: string): Promise<string>;
	downloadBlob(filename: string): Promise<Blob>;
}

export interface MenuSource {
	/** Menu file text by lower-cased name (RRF's SD card is FAT: names are case-insensitive). */
	files: Map<string, string>;
	/** Image (`.bin`) file bytes by lower-cased name. */
	images: Map<string, Uint8Array>;
}

export const MENU_DIRECTORY = "0:/menu";

export function emptyMenuSource(): MenuSource {
	return { files: new Map(), images: new Map() };
}

/** Build a source from in-memory files (tests, and the not-yet-saved text of a file being edited). */
export function menuSourceFromTexts(files: Record<string, string>): MenuSource {
	const source = emptyMenuSource();
	for (const [name, text] of Object.entries(files)) source.files.set(name.toLowerCase(), text);
	return source;
}

export async function loadMenuSource(io: MenuIO, directory: string = MENU_DIRECTORY): Promise<MenuSource> {
	const source = emptyMenuSource();
	const listing = await io.getFileList(directory);
	await Promise.all(listing.filter((e) => !e.isDirectory).map(async (entry) => {
		const path = `${directory}/${entry.name}`;
		const key = entry.name.toLowerCase();
		try {
			switch (classifyFile(path).kind) {
				case "menu":
					source.files.set(key, await io.downloadText(path));
					break;
				case "menu-image":
					source.images.set(key, new Uint8Array(await (await io.downloadBlob(path)).arrayBuffer()));
					break;
				default:
					break; // not something the display reads
			}
		} catch {
			// One unreadable file shouldn't hide the rest: it simply isn't there for the display, as on a real card.
		}
	}));
	return source;
}
