/** The built-in cue names. A pure module (no Vue, no storage) so pure code like conditions.ts can validate a name. */
export const CUE_NAMES = ["chime", "double", "alarm", "error"] as const;
export type CueName = (typeof CUE_NAMES)[number];

export const isCueName = (name: unknown): name is CueName => typeof name === "string" && (CUE_NAMES as ReadonlyArray<string>).includes(name);
