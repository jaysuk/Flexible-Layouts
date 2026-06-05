/**
 * Built-in sample layouts the user can drop in to see what's possible.
 *
 * Presets are additive - they create a new custom page and fill it, so loading one never disturbs
 * the user's existing layout. The CNC sample demonstrates command buttons, live value read-outs,
 * conditional colour and a built-in panel working together.
 */
import { type GridItemModel, newItemId } from "./document";
import { createCustomPage } from "./pageManager";
import { useLayoutStore } from "./store";

function item(partial: Omit<GridItemModel, "i">): GridItemModel {
	return { i: newItemId(), ...partial };
}

/** Create and populate a sample CNC control page. Returns its route path. */
export function loadCncPreset(): string {
	const path = createCustomPage({ title: "CNC", icon: "mdi-saw-blade", category: "control" });

	const items: Array<GridItemModel> = [
		item({ x: 0, y: 0, w: 12, h: 1, widget: { type: "label", variant: "heading", content: "CNC Control", align: "start" } }),

		// Live machine position
		item({ x: 0, y: 1, w: 4, h: 3, widget: { type: "value", omPath: "move.axes[0].machinePosition", label: "X", display: "number", unit: "mm", precision: 2 } }),
		item({ x: 4, y: 1, w: 4, h: 3, widget: { type: "value", omPath: "move.axes[1].machinePosition", label: "Y", display: "number", unit: "mm", precision: 2 } }),
		item({ x: 8, y: 1, w: 4, h: 3, widget: { type: "value", omPath: "move.axes[2].machinePosition", label: "Z", display: "number", unit: "mm", precision: 2 } }),

		// Homing + work-zero buttons
		item({ x: 0, y: 4, w: 4, h: 2, widget: { type: "codeButton", code: "G28", label: "Home All", icon: "mdi-home", color: "primary" } }),
		item({ x: 4, y: 4, w: 4, h: 2, widget: { type: "codeButton", code: "G28 X Y", label: "Home XY", icon: "mdi-home-outline", color: "primary" } }),
		item({ x: 8, y: 4, w: 4, h: 2, widget: { type: "codeButton", code: "G10 L20 P1 X0 Y0 Z0", label: "Zero Work", icon: "mdi-target", color: "secondary", confirm: true } }),

		// Spindle control with conditional colour on the speed read-out
		item({ x: 0, y: 6, w: 6, h: 2, widget: { type: "codeButton", code: "M3 S12000", label: "Spindle On", icon: "mdi-fan", color: "success" } }),
		item({ x: 6, y: 6, w: 6, h: 2, widget: { type: "codeButton", code: "M5", label: "Spindle Off", icon: "mdi-fan-off", color: "error", confirm: true } }),
		item({
			x: 0, y: 8, w: 4, h: 3,
			widget: { type: "value", omPath: "spindles[0].current", label: "Spindle", display: "number", unit: "rpm", precision: 0 },
			conditions: [{ omPath: "spindles[0].current", operator: "gt", value: 0, color: "success" }],
		}),

		// Set spindle speed + a built-in jog panel
		item({ x: 4, y: 8, w: 8, h: 3, widget: { type: "input", label: "Set spindle RPM", mode: "command", commandTemplate: "M3 S{value}", inputKind: "number", color: "primary" } }),
		item({ x: 0, y: 11, w: 12, h: 9, widget: { type: "builtinPanel", component: "MovementPanel" } }),
	];

	useLayoutStore().setItems(path, items, "custom");
	return path;
}
