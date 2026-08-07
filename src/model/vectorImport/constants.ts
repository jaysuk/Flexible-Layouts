/** Route path for the dedicated "Cut from drawing" page (registerRoute + FlexSettingsTab
 *  navigation), mirroring configBackup/constants.ts's CONFIG_BACKUP_ROUTE_PATH precedent.
 *  Code-level identifier is "vectorImport"; the user-facing caption deliberately avoids the word
 *  "import" - FL already uses that for LAYOUT import/export (editor/ImportExportDialog.vue, the
 *  `io.*` i18n namespace), and "Import" next to "Import layout" in the same nav drawer would read
 *  as a duplicate entry. */
export const VECTOR_IMPORT_ROUTE_PATH = "/Plugins/FlexibleLayouts/VectorImport";
