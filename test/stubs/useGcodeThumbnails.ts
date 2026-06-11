/**
 * Test stub for DWC's `@/composables/useGcodeThumbnails` (the real one pulls in `@/utils/path`, which
 * the test kit doesn't stub). Mirrors the shape FilesWidget consumes; `decorate` is a no-op, so
 * mounted file widgets simply render without thumbnails in tests.
 */
import { ref } from "vue";

export interface GcodeThumbnailItem {
	name: string;
	isDirectory?: boolean;
	thumbnails?: Array<unknown> | null;
	[key: string]: unknown;
}

export function useGcodeThumbnails() {
	return {
		decorate: (_items: Array<GcodeThumbnailItem>, _directory: string): void => { /* no-op in tests */ },
		cancelInFlight: (): void => { /* no-op */ },
		clearCacheForDirectory: (_dir: string): void => { /* no-op */ },
		fileinfoProgress: ref(-1),
		fileinfoTotal: ref(0),
	};
}
