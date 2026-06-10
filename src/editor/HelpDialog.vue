<template>
	<v-dialog :model-value="modelValue" max-width="680" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-help-circle</v-icon>
				{{ firstRun ? $t("plugins.flexibleLayouts.help.welcomeTitle") : $t("plugins.flexibleLayouts.help.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<p v-if="firstRun" class="mb-3">
					You're now using the <strong>Flexible Layouts</strong> shell. It lets you build your own
					DWC interface — rearrange panels, add buttons and read-outs, recolour, and more. Here's the gist:
				</p>

				<v-expansion-panels variant="accordion">
					<v-expansion-panel title="Editing">
						<v-expansion-panel-text>
							Click <strong>Edit</strong> in the top bar to start customising; <strong>Done</strong> to stop.
							While editing, drag a panel by its <em>header</em> to move it and a <em>corner</em> to resize it.
							Each panel has buttons to configure (⚙), duplicate (⧉), lock (🔒), back up (💾) and delete (🗑).
							<strong>Ctrl+Z / Ctrl+Y</strong> undo and redo. The edit toolbar floats below the app bar so
							<strong>Add widget</strong> and the rest stay reachable however far you've scrolled, and
							<strong>Tidy up</strong> packs the panels to use the least space.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Pages">
						<v-expansion-panel-text>
							The <strong>Dashboard</strong>, the standard pages (<strong>Console, Temperatures, Macros</strong>)
							and any <strong>pages you create</strong> are editable grids. <strong>Settings</strong>,
							<strong>Plugins</strong>, and the full <strong>Jobs / File Explorer</strong> pages stay native —
							you'll see an amber note on those while editing. Use <strong>Manage pages</strong> (drawer / edit
							bar) to add, rename, hide, reorder or delete pages, or to show a page only when a machine
							condition is true. The Jobs &amp; File-explorer browsers are also available as droppable panels.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Widgets">
						<v-expansion-panel-text>
							<strong>Add widget</strong> opens a palette with a live preview: built-in DWC panels, pages/tabs
							from other plugins, a <strong>custom panel (group)</strong>, command buttons (G-code / macros /
							HTTP / open-URL), input fields, live value read-outs, charts, text/images and web embeds.
							Use the 🌳 browse button to pick object-model values without typing paths. See the full list in
							<em>Widget &amp; panel reference</em> below.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Widget &amp; panel reference">
						<v-expansion-panel-text>
							<div v-for="g in categoryGroups" :key="g.cat" class="mb-3">
								<div class="text-title-small mb-1">{{ g.label }}</div>
								<div class="d-flex flex-wrap ga-2">
									<v-chip v-for="it in g.items" :key="it.label" size="small" variant="tonal" :prepend-icon="it.icon">{{ it.label }}</v-chip>
								</div>
							</div>
							<div class="mb-1">
								<div class="text-title-small mb-1">Built-in DWC panels</div>
								<div class="d-flex flex-wrap ga-2">
									<v-chip v-for="it in panelItems" :key="it.label" size="small" variant="tonal" :prepend-icon="it.icon">{{ it.label }}</v-chip>
								</div>
							</div>
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Smart behaviour &amp; styling">
						<v-expansion-panel-text>
							In a widget's settings you can add <strong>conditions</strong> (recolour / hide / disable based on
							the machine state), <strong>value formatting</strong> (units, on/off text, value→text maps),
							<strong>colours</strong>, and <strong>text &amp; size</strong> — with a <strong>separate font and
							size for labels</strong> so captions can stay small while values grow. <strong>Scale content to
							fit</strong> (off by default) shrinks a panel to its cell instead of scrolling; turn it on per panel.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Responsive">
						<v-expansion-panel-text>
							While editing, the desktop/tablet/phone toggle lets each page have a separate layout per screen
							size. Smaller sizes inherit the larger layout until you change them.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Profiles, backup &amp; restore">
						<v-expansion-panel-text>
							<strong>Layout profiles</strong> keep several complete interfaces (e.g. FFF / CNC) you switch
							between from the top bar. <strong>Backup &amp; share</strong> (edit bar) exports your layout to a
							file: tick exactly what to include — <strong>Theme</strong>, <strong>Top bar</strong>,
							<strong>Pages</strong>, <strong>Status &amp; nav</strong> — so you can make a <em>theme-only</em>
							backup, or one that <em>excludes</em> the theme. You can also back up a <strong>single page</strong>
							from the dropdown. On <strong>restore</strong>, choose which parts and which pages to apply (it
							merges over your current layout) and you're warned about any plugins the file needs.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Diagnostics &amp; reporting a problem">
						<v-expansion-panel-text>
							If something misbehaves, grab a <strong>diagnostic report</strong> to attach to a bug report. You
							can download it from the <strong>Flexible Layouts settings tab</strong> (Diagnostics), from a
							panel that has errored (its <strong>Report</strong> button), or from a page that failed to render
							(<strong>Download report</strong> on the error screen). The report bundles the plugin/firmware
							versions, recent errors, your layout, and a copy of the object model with
							<strong>network details, serial numbers and file names redacted</strong>. Tip: a captured report
							can be replayed by the developer to reproduce the exact failure.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Where your layout is saved">
						<v-expansion-panel-text>
							Your layout is stored with DWC's settings <strong>on the Duet itself</strong>
							(<code>0:/sys/dwc-settings.json</code>), not in this browser. So it follows the
							<strong>machine</strong>: connect from a different PC, or if the board's IP/hostname changes,
							and all your pages, panels, profiles and colours come across automatically.
							<br><br>
							The exception is <strong>Settings → General → "Store settings in this browser"</strong>. With
							that on, your layout lives only in this browser and is tied to the exact address you used —
							it <em>won't</em> appear on another PC, and changing the board's IP/hostname will hide it.
							Leave that option <strong>off</strong> (the default) if you want your layout to travel with the machine.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="If something goes wrong">
						<v-expansion-panel-text>
							Type <strong>/BuiltInLayout</strong> in the address bar to return to stock DWC at any time.
							You can also switch back from <strong>Settings → Display</strong> or the Flexible Layouts settings
							tab. A page that can't render shows a recovery screen (<strong>Try again</strong> /
							<strong>Download report</strong> / <strong>Use built-in layout</strong>) — your saved layout is never lost.
						</v-expansion-panel-text>
					</v-expansion-panel>
				</v-expansion-panels>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn color="primary" @click="close">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";

import { BUILTIN_PANELS, FREEFORM_WIDGETS, WIDGET_CATEGORIES } from "../widgets/registry";

defineProps<{ modelValue: boolean; firstRun?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const t = (key: string) => i18n.global.t(key);

// Built from the registry so the reference always lists every widget/panel that can be added.
const categoryGroups = computed(() =>
	WIDGET_CATEGORIES.map((cat) => ({
		cat,
		label: t(`plugins.flexibleLayouts.paletteCategory.${cat}`),
		items: FREEFORM_WIDGETS.filter((w) => w.category === cat).map((w) => ({ icon: w.icon, label: t(`plugins.flexibleLayouts.${w.labelKey}`) })),
	})).filter((g) => g.items.length > 0));
const panelItems = computed(() => BUILTIN_PANELS.map((p) => ({ icon: p.icon, label: t(`plugins.flexibleLayouts.${p.labelKey}`) })));

function close() {
	emit("update:modelValue", false);
}
</script>
