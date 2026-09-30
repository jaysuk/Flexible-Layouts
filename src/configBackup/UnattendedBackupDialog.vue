<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable :attach="props.attach"
			  :aria-label="$t('plugins.flexibleLayouts.configBackup.unattended.title')"
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-script-text-play-outline</v-icon>
				{{ $t("plugins.flexibleLayouts.configBackup.unattended.title") }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.close')" icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<p class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.configBackup.unattended.intro") }}</p>

				<v-alert type="warning" variant="tonal" density="compact" class="mb-3 unattended-warning">
					<div class="font-weight-medium mb-1">{{ $t("plugins.flexibleLayouts.configBackup.unattended.warningTitle") }}</div>
					<ul class="ps-4">
						<li>{{ $t("plugins.flexibleLayouts.configBackup.unattended.warnPrivate") }}</li>
						<li>{{ $t("plugins.flexibleLayouts.configBackup.unattended.warnNoRedaction") }}</li>
						<li>{{ $t("plugins.flexibleLayouts.configBackup.unattended.warnPassword") }}</li>
						<li>{{ $t("plugins.flexibleLayouts.configBackup.unattended.warnRestore") }}</li>
					</ul>
				</v-alert>

				<v-row dense>
					<v-col cols="12" sm="8">
						<v-text-field v-model="host" density="compact" variant="outlined" hide-details class="ub-host"
									  :label="$t('plugins.flexibleLayouts.configBackup.unattended.host')" />
					</v-col>
					<v-col cols="12" sm="4">
						<v-select v-model="protocol" :items="['http', 'https']" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.configBackup.unattended.protocol')" />
					</v-col>
					<v-col cols="12" sm="6">
						<v-select v-model="flavour" :items="flavourItems" density="compact" variant="outlined" hide-details class="ub-flavour"
								  :label="$t('plugins.flexibleLayouts.configBackup.unattended.flavour')" />
					</v-col>
					<v-col cols="6" sm="3">
						<v-text-field v-model.number="keep" type="number" min="1" max="365" density="compact" variant="outlined" hide-details class="ub-keep"
									  :label="$t('plugins.flexibleLayouts.configBackup.unattended.keep')" />
					</v-col>
					<v-col cols="6" sm="3">
						<v-text-field v-model="passwordEnv" density="compact" variant="outlined" hide-details class="ub-env"
									  :label="$t('plugins.flexibleLayouts.configBackup.unattended.passwordEnv')" />
					</v-col>
					<v-col cols="12">
						<v-text-field v-model="outDir" density="compact" variant="outlined" hide-details class="ub-outdir"
									  :label="$t('plugins.flexibleLayouts.configBackup.unattended.outDir')" />
					</v-col>
				</v-row>
				<div class="d-flex flex-wrap ga-3 mt-1 mb-1">
					<v-checkbox v-for="f in folderChoices" :key="f.path" v-model="f.on" density="compact" hide-details :disabled="f.required"
								:label="f.path + (f.required ? ' *' : '')" class="ub-folder" />
				</div>

				<v-alert v-if="problem" type="error" variant="tonal" density="compact" class="mt-2 ub-problem">{{ problem }}</v-alert>

				<template v-else>
					<div class="d-flex flex-wrap ga-2 mt-3">
						<v-btn color="primary" variant="flat" size="small" prepend-icon="mdi-download" class="ub-download" @click="download">
							{{ $t("plugins.flexibleLayouts.configBackup.unattended.download") }}
						</v-btn>
						<v-btn variant="tonal" size="small" prepend-icon="mdi-content-copy" class="ub-copy-script" @click="copy(script)">
							{{ $t("plugins.flexibleLayouts.configBackup.unattended.copyScript") }}
						</v-btn>
						<span v-if="copied" class="text-caption text-success align-self-center ub-copied">{{ $t("plugins.flexibleLayouts.configBackup.unattended.copied") }}</span>
					</div>

					<div class="text-title-small mt-4 mb-1">{{ $t("plugins.flexibleLayouts.configBackup.unattended.scheduleHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.configBackup.unattended.scheduleHint", { file: filename }) }}</div>
					<v-tabs v-model="tab" density="compact">
						<v-tab value="cron" class="text-none">cron (Linux, macOS)</v-tab>
						<v-tab value="windows" class="text-none">Windows</v-tab>
						<v-tab value="systemd" class="text-none">systemd</v-tab>
					</v-tabs>
					<pre class="ub-snippet pa-2 mt-1"><code>{{ snippetText }}</code></pre>
					<v-btn variant="text" size="x-small" prepend-icon="mdi-content-copy" class="ub-copy-snippet" @click="copy(snippetText)">
						{{ $t("plugins.flexibleLayouts.configBackup.unattended.copySnippet") }}
					</v-btn>
				</template>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import { writeSystemClipboard } from "../model/widgetClipboard";
import {
	DEFAULT_UNATTENDED_FOLDERS, detectFlavour, generateUnattendedScript, schedulerSnippets, UNATTENDED_SCRIPT_FILENAME,
	UnattendedOptionsError, type UnattendedFlavour, type UnattendedOptions,
} from "../model/configBackup/unattendedScript";

// `attach` is a plain pass-through to v-dialog's own prop, left unset in real use (tests only).
const props = defineProps<{ modelValue: boolean; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();
const filename = UNATTENDED_SCRIPT_FILENAME;

const detected = computed<UnattendedFlavour>(() => detectFlavour(machineStore.model));
const host = ref("");
const protocol = ref<"http" | "https">("http");
const flavour = ref<UnattendedFlavour>("standalone");
const keep = ref(14);
const outDir = ref("./duet-backups");
const passwordEnv = ref("DUET_PASSWORD");
const tab = ref<"cron" | "windows" | "systemd">("cron");
const copied = ref(false);

// The folders: 0:/sys is required (the script fails without it), the rest are optional.
const folderChoices = reactive(DEFAULT_UNATTENDED_FOLDERS.map((path) => ({ path, on: true, required: path === "0:/sys" })));

const flavourItems = computed(() => (["standalone", "sbc"] as const).map((f) => ({
	title: i18n.global.t(`plugins.flexibleLayouts.configBackup.unattended.flavours.${f}`) + (f === detected.value ? ` - ${i18n.global.t("plugins.flexibleLayouts.configBackup.unattended.detected")}` : ""),
	value: f,
})));

// Start from where DWC is being served (host and protocol) and from the flavour this machine reports; re-fill each time
// the dialog opens so it reflects the machine it is opened on.
watch(() => props.modelValue, (open) => {
	if (!open) { return; }
	host.value = typeof location !== "undefined" ? location.host : "";
	protocol.value = typeof location !== "undefined" && location.protocol === "https:" ? "https" : "http";
	flavour.value = detected.value;
	copied.value = false;
}, { immediate: true });

const options = computed<UnattendedOptions>(() => ({
	host: host.value, protocol: protocol.value, flavour: flavour.value, keep: keep.value, outDir: outDir.value, passwordEnv: passwordEnv.value,
	folders: folderChoices.filter((f) => f.on || f.required).map((f) => f.path),
}));

const generated = computed<{ script: string; snippets: ReturnType<typeof schedulerSnippets> } | { error: string }>(() => {
	try {
		return { script: generateUnattendedScript(options.value), snippets: schedulerSnippets(options.value, `/path/to/${filename}`) };
	} catch (e) {
		return { error: e instanceof UnattendedOptionsError ? e.message : String(e) };
	}
});
const problem = computed(() => ("error" in generated.value ? generated.value.error : ""));
const script = computed(() => ("script" in generated.value ? generated.value.script : ""));
const snippetText = computed(() => {
	if (!("snippets" in generated.value)) { return ""; }
	const s = generated.value.snippets;
	return tab.value === "cron" ? s.cron : tab.value === "windows" ? s.schtasks : `${s.systemdService}\n\n${s.systemdTimer}`;
});

async function copy(text: string) {
	copied.value = await writeSystemClipboard(text);
	setTimeout(() => { copied.value = false; }, 2500);
}

function download() {
	const blob = new Blob([script.value], { type: "text/javascript" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<style scoped>
.ub-snippet {
	background: rgba(var(--v-theme-on-surface), 0.06);
	border-radius: 4px;
	overflow-x: auto;
	font-size: 0.8rem;
	white-space: pre;
}
</style>
