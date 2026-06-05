/**
 * Shared plugin identifiers.
 *
 * Kept in their own leaf module so any file can import them without pulling in `index.ts` (which
 * would create an import cycle, since index.ts imports the shell, settings tab, etc.).
 */

/**
 * Manifest id (plugin.json `id`). This is what DWC uses for plugin load/unload events
 * (`dwcPluginLoaded` / `dwcPluginUnloaded`) and the dwcFiles manifest. Distinct from the camelCase
 * settings/i18n key below.
 */
export const PLUGIN_MANIFEST_ID = "FlexibleLayouts";
