/**
 * The FIGlet fonts the text-banner dialog offers. `dwc-gcode-editor` bundles only "Standard"; the rest ship as
 * ONE asset (`dwc/js/flexible-layouts-banner-fonts.json`, built by scripts/build-banner-fonts.mjs) that is fetched
 * the first time the dialog opens, so they cost nothing in the main bundle. A font is parsed into figlet only when
 * it is picked. If the asset cannot be fetched (offline build, strict CSP, a test) the list is just "Standard".
 */
import { parseAsciiArtFont } from "dwc-gcode-editor";
import { pluginAssetUrl } from "@/plugins";

export const DEFAULT_BANNER_FONT = "Standard";
const FONTS_ASSET_PATH = "js/flexible-layouts-banner-fonts.json";
const FONT_STORAGE_KEY = "flexibleLayouts.bannerFont";

let catalogue: Promise<Record<string, string>> | null = null;
// Fonts this module has parsed into figlet. Not figlet's own `fontsSync()`: in a browser that lists every font figlet
// knows by NAME (332) whether or not its data is loaded, and rendering one that is not loaded produces nothing.
const parsed = new Set<string>([DEFAULT_BANNER_FONT]);

async function fetchCatalogue(): Promise<Record<string, string>> {
	try {
		const response = await fetch(pluginAssetUrl(FONTS_ASSET_PATH));
		if (!response.ok) return {};
		const data: unknown = await response.json();
		if (typeof data !== "object" || data === null) return {};
		return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
	} catch {
		return {};
	}
}

function load(): Promise<Record<string, string>> {
	catalogue ??= fetchCatalogue();
	return catalogue;
}

/** Every font name the dialog can offer: "Standard" first, then the shipped fonts alphabetically. */
export async function listBannerFonts(): Promise<string[]> {
	const others = Object.keys(await load()).filter((name) => name !== DEFAULT_BANNER_FONT);
	return [DEFAULT_BANNER_FONT, ...others.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))];
}

/** Makes `font` renderable (parses it into figlet on first use). False when it is not available. */
export async function ensureBannerFont(font: string): Promise<boolean> {
	if (parsed.has(font)) return true;
	const data = (await load())[font];
	if (data === undefined) return false;
	try {
		parseAsciiArtFont(font, data);
		parsed.add(font);
		return true;
	} catch {
		return false;
	}
}

/** The font this browser last used (per device, so not in the shared document). */
export function loadBannerFontChoice(): string {
	try {
		return localStorage.getItem(FONT_STORAGE_KEY) ?? DEFAULT_BANNER_FONT;
	} catch {
		return DEFAULT_BANNER_FONT;
	}
}

export function saveBannerFontChoice(font: string): void {
	try {
		localStorage.setItem(FONT_STORAGE_KEY, font);
	} catch {
		// storage blocked - the choice just is not remembered
	}
}
