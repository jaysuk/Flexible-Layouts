/**
 * Curated set of Material Design Icons for the visual icon picker.
 *
 * MDI ships thousands of icons; bundling the full name list would bloat the plugin for little
 * benefit. This is a hand-picked selection biased towards 3D-printing / CNC / machine-control and
 * general UI use. The picker also lets advanced users type any `mdi-*` name directly, so this list
 * only needs to cover the common cases. All names are valid in @mdi/font 7.x (DWC's bundled set).
 */
export const ICON_LIST: ReadonlyArray<string> = [
	// Dashboards / layout
	"mdi-view-dashboard", "mdi-view-dashboard-outline", "mdi-view-dashboard-variant",
	"mdi-view-grid", "mdi-view-grid-outline", "mdi-view-quilt", "mdi-view-column",
	"mdi-monitor-dashboard", "mdi-gauge", "mdi-gauge-full", "mdi-speedometer",
	// Printing / CNC / machines
	"mdi-printer-3d", "mdi-printer-3d-nozzle", "mdi-printer-3d-nozzle-outline",
	"mdi-saw-blade", "mdi-robot-industrial", "mdi-cog", "mdi-cogs", "mdi-cog-outline",
	"mdi-engine", "mdi-fan", "mdi-fan-chevron-up", "mdi-pump", "mdi-laser-pointer",
	"mdi-axis-arrow", "mdi-axis-x-arrow", "mdi-axis-y-arrow", "mdi-axis-z-arrow",
	"mdi-arrow-up-down", "mdi-arrow-all", "mdi-axis", "mdi-rotate-3d-variant",
	"mdi-ruler", "mdi-ruler-square", "mdi-tape-measure", "mdi-set-square",
	"mdi-grid", "mdi-grid-large", "mdi-vector-square",
	// Tools
	"mdi-wrench", "mdi-wrench-outline", "mdi-tools", "mdi-hammer", "mdi-screwdriver",
	"mdi-toolbox", "mdi-toolbox-outline", "mdi-hammer-wrench",
	// Heat / temperature / material
	"mdi-thermometer", "mdi-thermometer-lines", "mdi-fire", "mdi-radiator",
	"mdi-snowflake", "mdi-water", "mdi-water-percent", "mdi-cube", "mdi-cube-outline",
	"mdi-spool", "mdi-printer-3d-nozzle-heat",
	// Playback / job control
	"mdi-play", "mdi-play-circle", "mdi-pause", "mdi-pause-circle", "mdi-stop",
	"mdi-stop-circle", "mdi-restart", "mdi-skip-next", "mdi-fast-forward", "mdi-rewind",
	"mdi-play-pause", "mdi-record", "mdi-power", "mdi-power-standby", "mdi-flash",
	// Files / folders
	"mdi-folder", "mdi-folder-outline", "mdi-folder-open", "mdi-file", "mdi-file-outline",
	"mdi-file-document", "mdi-file-cog", "mdi-sd", "mdi-harddisk", "mdi-content-save",
	"mdi-tray-full", "mdi-archive", "mdi-clipboard-text",
	// Charts / data
	"mdi-chart-line", "mdi-chart-bar", "mdi-chart-areaspline", "mdi-chart-arc",
	"mdi-chart-scatter-plot", "mdi-chart-bell-curve", "mdi-pulse", "mdi-sine-wave",
	"mdi-file-tree", "mdi-table", "mdi-database",
	// Camera / view
	"mdi-webcam", "mdi-camera", "mdi-video", "mdi-eye", "mdi-eye-outline",
	"mdi-cube-scan", "mdi-grid-off",
	// Status / alerts
	"mdi-information", "mdi-information-outline", "mdi-alert", "mdi-alert-circle",
	"mdi-check", "mdi-check-circle", "mdi-close", "mdi-close-circle", "mdi-bell",
	"mdi-help-circle", "mdi-shield-check", "mdi-flag",
	// Controls / UI
	"mdi-tune", "mdi-tune-vertical", "mdi-toggle-switch", "mdi-toggle-switch-off",
	"mdi-gesture-tap-button", "mdi-button-cursor", "mdi-keyboard", "mdi-console",
	"mdi-console-line", "mdi-code-tags", "mdi-script-text", "mdi-cog-play",
	"mdi-lightbulb", "mdi-lightbulb-on", "mdi-led-on", "mdi-palette", "mdi-brush",
	// Navigation / home / misc
	"mdi-home", "mdi-home-outline", "mdi-menu", "mdi-apps", "mdi-puzzle",
	"mdi-puzzle-outline", "mdi-star", "mdi-star-outline", "mdi-heart", "mdi-bookmark",
	"mdi-cellphone", "mdi-monitor", "mdi-tablet", "mdi-rocket-launch", "mdi-lightning-bolt",
	"mdi-magnet", "mdi-target", "mdi-crosshairs-gps", "mdi-map-marker", "mdi-clock-outline",
	"mdi-timer-outline", "mdi-calendar", "mdi-account", "mdi-robot",
];
