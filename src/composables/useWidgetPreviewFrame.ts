/**
 * Shared scaling math for rendering a widget "at real size, shrunk to fit a small frame" - used by
 * WidgetPalette.vue's hover preview and the What's New dialog's widget showcase cards. Extracted
 * out of WidgetPalette so both stay in sync instead of drifting apart as separate copies.
 */

/**
 * Compute the inline style for a preview stage: sized to the widget's real grid footprint (≈ a
 * 12-col grid at ~90px/col, 30px rows, clamped to sane bounds), then scaled uniformly to fit inside
 * `frame` so the widget lays out as it would on an actual page rather than being crammed into a
 * narrow box and wrapping oddly. Never scales up (a small widget just sits centred, unscaled).
 *
 * The stage is meant to be absolutely positioned and centred within a `position: relative` frame of
 * exactly `frame.w`x`frame.h` px - `translate(-50%,-50%)` centres the stage's own (large) box, then
 * `scale()` shrinks it, so being out of flow its footprint can never push the frame's layout around.
 */
export function previewTransform(size: { w: number; h: number }, frame: { w: number; h: number }): Record<string, string> {
	const footW = Math.min(Math.max(size.w * 90, 160), 900);
	const footH = Math.min(Math.max(size.h * 30, 80), 640);
	const scale = Math.min(frame.w / footW, frame.h / footH, 1);
	return {
		width: `${footW}px`,
		height: `${footH}px`,
		transform: `translate(-50%, -50%) scale(${scale})`,
	};
}
