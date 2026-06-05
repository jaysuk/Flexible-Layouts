<template>
	<v-dialog :model-value="modelValue" max-width="640" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-help-circle</v-icon>
				{{ firstRun ? $t("plugins.flexibleLayouts.help.welcomeTitle") : $t("plugins.flexibleLayouts.help.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
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
							<strong>Ctrl+Z / Ctrl+Y</strong> undo and redo.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Pages">
						<v-expansion-panel-text>
							The <strong>Dashboard</strong> and any <strong>pages you create</strong> are editable grids.
							Built-in DWC pages (Console, Settings, File Explorer, Job…) stay as they are — you'll see an
							amber note on those while editing. Use <strong>Manage pages</strong> (drawer / edit bar) to add,
							rename, hide, reorder or delete pages, or to show a page only when a machine condition is true.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Widgets">
						<v-expansion-panel-text>
							<strong>Add widget</strong> opens a palette: built-in DWC panels, pages/tabs from other plugins,
							a <strong>custom panel (group)</strong>, command buttons (G-code / macros / HTTP / open-URL),
							input fields, live value read-outs, charts, text/images and web embeds.
							Use the 🌳 browse button to pick object-model values without typing paths.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Smart behaviour">
						<v-expansion-panel-text>
							In a widget's settings you can add <strong>conditions</strong> (recolour / hide / disable based on
							the machine state), <strong>value formatting</strong> (units, on/off text, value→text maps),
							<strong>colours</strong>, <strong>text size &amp; font</strong>, and <strong>scale-to-fit</strong>
							so panels shrink to their cell instead of scrolling.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Responsive">
						<v-expansion-panel-text>
							While editing, the desktop/tablet/phone toggle lets each page have a separate layout per screen
							size. Smaller sizes inherit the larger layout until you change them.
						</v-expansion-panel-text>
					</v-expansion-panel>

					<v-expansion-panel title="Profiles, backup &amp; sharing">
						<v-expansion-panel-text>
							<strong>Layout profiles</strong> keep several complete interfaces (e.g. FFF / CNC) you switch
							between from the top bar. <strong>Backup &amp; share</strong> exports the whole layout, a single
							page, or a single panel to a file you can share — and warns the recipient about any plugins they
							need. Try <strong>Add sample CNC page</strong> there to see a worked example.
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
							You can also switch back from <strong>Settings → Display</strong> or the Flexible Layouts settings tab.
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
defineProps<{ modelValue: boolean; firstRun?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function close() {
	emit("update:modelValue", false);
}
</script>
