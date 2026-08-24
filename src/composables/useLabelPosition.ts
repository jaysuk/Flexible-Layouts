/**
 * Maps a widget's `labelPosition` config onto a flex-direction class, so a two-block layout (a
 * value/gauge/clock face plus its own label) can be told to stack top/bottom or sit side by side
 * left/right.
 *
 * This is the third copy of the exact mapping `CommandButtonWidget.vue` and `ToggleWidget.vue`
 * already duplicate between themselves for `iconPosition` (the latter's own comment says so
 * explicitly: "Matches CommandButtonWidget's own iconLayoutClass exactly") - introduced here once
 * so a fourth value-displaying widget doesn't repeat the same switch statement a third time.
 */
export type LabelPosition = "top" | "bottom" | "left" | "right";

/**
 * `position` is the widget's own (possibly unset) config value; `fallback` is what that widget
 * rendered before this option existed, so leaving `labelPosition` unset never changes how an
 * existing saved layout looks.
 */
export function labelFlexClass(position: LabelPosition | undefined, fallback: LabelPosition): string {
	switch (position ?? fallback) {
		case "left": return "flex-row";
		case "right": return "flex-row-reverse";
		case "bottom": return "flex-column-reverse";
		default: return "flex-column";
	}
}
