<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable persistent @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-lock-check-outline</v-icon>
				{{ $t("plugins.flexibleLayouts.tlsSetup.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<!-- Step 1: capability -->
				<template v-if="step === 'capability'">
					<div class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.tlsSetup.intro") }}</div>

					<v-list v-if="capabilities.length > 0" density="compact" class="mb-2">
						<v-list-item v-for="c in capabilities" :key="c.kind">
							<template #prepend>
								<v-icon :color="c.tls.capable ? 'success' : 'error'">
									{{ c.tls.capable ? "mdi-check-circle-outline" : "mdi-close-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ interfaceLabel(c) }}</v-list-item-title>
							<v-list-item-subtitle v-if="!c.tls.capable">{{ capabilityReasonText(c) }}</v-list-item-subtitle>
						</v-list-item>
					</v-list>
					<v-alert v-else type="warning" variant="tonal" density="compact" class="mb-2">
						{{ $t("plugins.flexibleLayouts.tlsSetup.noInterfaces") }}
					</v-alert>

					<template v-if="capableInterfaces.length > 1">
						<div class="text-body-2 mt-3 mb-1">{{ $t("plugins.flexibleLayouts.tlsSetup.pickInterface") }}</div>
						<v-radio-group v-model="selectedKind" density="compact" hide-details>
							<v-radio v-for="c in capableInterfaces" :key="c.kind" :value="c.kind" :label="interfaceLabel(c)" />
						</v-radio-group>
					</template>

					<v-alert v-if="capabilities.length > 0 && capableInterfaces.length === 0" type="error" variant="tonal" density="compact" class="mt-3">
						{{ $t("plugins.flexibleLayouts.tlsSetup.noneCapable") }}
					</v-alert>

					<div class="d-flex ga-2 mt-4">
						<v-btn color="primary" :disabled="!selectedInterface" @click="step = 'generate'">
							{{ $t("plugins.flexibleLayouts.tlsSetup.continueButton") }}
						</v-btn>
					</div>
				</template>

				<!-- Step 2: generate certificate -->
				<template v-else-if="step === 'generate'">
					<div class="text-body-2 mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.generateIntro") }}</div>
					<v-alert type="info" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.tlsSetup.generateRequirements") }}
					</v-alert>
					<v-text-field v-model.number="certValidityDays" type="number" min="1" max="7300" density="compact" variant="outlined"
								  hide-details :label="$t('plugins.flexibleLayouts.tlsSetup.validityDaysLabel')" style="max-width: 220px;" class="mb-3" />
					<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.tlsSetup.generateOsNote") }}</div>
					<pre class="pa-3 mb-3" style="background: rgba(128,128,128,0.12); border-radius: 6px; white-space: pre-wrap; font-size: 0.8rem;">{{ opensslCommand }}</pre>
					<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.tlsSetup.generateWindowsNote") }}</div>

					<v-divider class="my-3" />
					<div class="text-body-2 mb-1">{{ $t("plugins.flexibleLayouts.tlsSetup.generateWindowsToolIntro") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.generateWindowsToolNote") }}</div>
					<div class="d-flex ga-2 flex-wrap">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-github" :href="TLS_CERT_GENERATOR_URL" target="_blank" rel="noopener">
							{{ $t("plugins.flexibleLayouts.tlsSetup.generateWindowsToolLink") }}
						</v-btn>
						<v-btn size="small" variant="tonal" prepend-icon="mdi-download" @click="onDownloadArgsFile">
							{{ $t("plugins.flexibleLayouts.tlsSetup.downloadArgsButton") }}
						</v-btn>
					</div>

					<div class="d-flex ga-2 mt-4">
						<v-btn variant="tonal" @click="step = 'capability'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
						<v-btn color="primary" @click="step = 'upload'">
							{{ $t("plugins.flexibleLayouts.tlsSetup.generatedButton") }}
						</v-btn>
					</div>
				</template>

				<!-- Step 3: upload -->
				<template v-else-if="step === 'upload'">
					<div class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.tlsSetup.uploadIntro") }}</div>

					<div class="mb-3">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-file-key-outline" @click="keyInput?.click()">
							{{ $t("plugins.flexibleLayouts.tlsSetup.pickKeyButton") }}
						</v-btn>
						<span class="ms-2 text-body-2">{{ keyFileLabel }}</span>
						<input ref="keyInput" type="file" class="d-none" @change="onKeyFileSelected" />
						<v-alert v-if="keyCheck && !keyCheck.ok" type="error" variant="tonal" density="compact" class="mt-1">
							{{ pemReasonText(keyCheck.reason) }}
						</v-alert>
					</div>

					<div class="mb-3">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-file-certificate-outline" @click="certInput?.click()">
							{{ $t("plugins.flexibleLayouts.tlsSetup.pickCertButton") }}
						</v-btn>
						<span class="ms-2 text-body-2">{{ certFileLabel }}</span>
						<input ref="certInput" type="file" class="d-none" @change="onCertFileSelected" />
						<v-alert v-if="certCheck && !certCheck.ok" type="error" variant="tonal" density="compact" class="mt-1">
							{{ pemReasonText(certCheck.reason) }}
						</v-alert>
					</div>

					<v-alert v-if="uploadError" type="error" variant="tonal" density="compact" class="mb-2">{{ uploadError }}</v-alert>

					<div class="d-flex ga-2 mt-2">
						<v-btn variant="tonal" :disabled="uploading" @click="step = 'generate'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
						<v-btn color="primary" :loading="uploading" :disabled="!canUpload" @click="onUploadFiles">
							{{ $t("plugins.flexibleLayouts.tlsSetup.uploadButton") }}
						</v-btn>
					</div>
				</template>

				<!-- Step 4: enable -->
				<template v-else-if="step === 'enable'">
					<div class="text-body-2 mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.enableIntro") }}</div>
					<v-alert type="warning" variant="tonal" density="compact" class="mb-2">
						{{ $t("plugins.flexibleLayouts.tlsSetup.enableInterfaceRestartWarning") }}
					</v-alert>
					<div class="d-flex ga-2 align-center mb-2">
						<v-btn size="small" color="primary" :loading="enablingInterface" :disabled="interfaceEnableResult?.ok"
							   @click="onEnableInterface">
							{{ $t("plugins.flexibleLayouts.tlsSetup.enableInterfaceButton") }}
						</v-btn>
						<v-chip v-if="interfaceEnableResult" size="small" :color="interfaceEnableResult.ok ? 'success' : 'error'" variant="tonal">
							{{ interfaceEnableResult.message }}
						</v-chip>
					</div>

					<template v-if="interfaceEnableResult?.ok">
						<v-divider class="my-3" />
						<div class="text-body-2 mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.protocolsIntro") }}</div>
						<div v-for="p in protocolChoices" :key="p.value" class="d-flex align-center ga-2 mb-1 flex-wrap">
							<v-checkbox v-model="p.enabled" density="compact" hide-details :label="p.tlsLabel" style="min-width: 140px;" />
							<v-text-field v-if="p.enabled" v-model.number="p.port" type="number" density="compact" variant="outlined"
										  hide-details :label="$t('plugins.flexibleLayouts.tlsSetup.portLabel')" style="max-width: 140px;" />
							<v-chip v-if="p.result" size="small" :color="p.result.ok ? 'success' : 'error'" variant="tonal">{{ p.result.message }}</v-chip>
						</div>
						<v-btn size="small" color="primary" class="mt-2" :loading="enablingProtocols" @click="onEnableProtocols">
							{{ $t("plugins.flexibleLayouts.tlsSetup.enableProtocolsButton") }}
						</v-btn>
					</template>

					<div class="d-flex ga-2 mt-4">
						<v-btn variant="tonal" @click="step = 'upload'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
						<v-btn color="primary" :disabled="!interfaceEnableResult?.ok" @click="step = 'persist'">
							{{ $t("plugins.flexibleLayouts.tlsSetup.continueButton") }}
						</v-btn>
					</div>
				</template>

				<!-- Step 5: persist to config.g -->
				<template v-else-if="step === 'persist'">
					<div class="text-body-2 mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.persistIntro") }}</div>

					<v-progress-circular v-if="loadingConfig" indeterminate size="24" class="mb-2" />
					<template v-else-if="patchPlan">
						<template v-if="patchPlan.changes.length > 0">
							<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.tlsSetup.persistChanges") }}</div>
							<ul class="text-caption mb-3">
								<li v-for="(c, i) in patchPlan.changes" :key="i">{{ c }}</li>
							</ul>
						</template>
						<v-alert v-else type="info" variant="tonal" density="compact" class="mb-3">
							{{ $t("plugins.flexibleLayouts.tlsSetup.persistNothingToDo") }}
						</v-alert>
					</template>

					<v-alert v-if="persistError" type="error" variant="tonal" density="compact" class="mb-2">{{ persistError }}</v-alert>

					<div class="d-flex ga-2 mt-2">
						<v-btn variant="tonal" :disabled="applyingPersist" @click="step = 'enable'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
						<v-btn color="primary" :loading="applyingPersist" :disabled="!patchPlan || patchPlan.changes.length === 0"
							   @click="onApplyPersist">
							{{ $t("plugins.flexibleLayouts.tlsSetup.applyButton") }}
						</v-btn>
						<v-btn v-if="patchPlan && patchPlan.changes.length === 0" color="primary" @click="step = 'done'">
							{{ $t("plugins.flexibleLayouts.tlsSetup.continueButton") }}
						</v-btn>
					</div>
				</template>

				<!-- Step 6: done -->
				<template v-else-if="step === 'done'">
					<v-alert type="success" variant="tonal" density="comfortable" class="mb-3">
						{{ $t("plugins.flexibleLayouts.tlsSetup.doneHeading") }}
					</v-alert>
					<p class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.tlsSetup.doneTrustNote") }}</p>

					<v-divider class="mb-3" />
					<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.tlsSetup.reminderHeading") }}</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.tlsSetup.reminderIntro") }}</div>
					<v-checkbox v-model="reminderEnabled" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.tlsSetup.reminderEnable')" @update:model-value="saveReminderSettings" />
					<v-text-field v-if="reminderEnabled" v-model.number="reminderWarningDays" type="number" min="1" max="365"
								  density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.tlsSetup.reminderDaysLabel')" style="max-width: 260px;" class="mt-2"
								  @update:model-value="saveReminderSettings" />
				</template>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="close">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { downloadBlob } from "dwc-plugin-runtime";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { assessTlsCapabilities, getMainboardFirmwareName, isStm32PortBoard } from "../model/tlsSetup/capability";
import type { InterfaceCapability } from "../model/tlsSetup/capability";
import { checkCertificatePem, checkPrivateKeyPem } from "../model/tlsSetup/certFiles";
import type { PemCheckReason } from "../model/tlsSetup/certFiles";
import { parseCertExpiry } from "../model/tlsSetup/certExpiry";
import { interpretTlsReply } from "../model/tlsSetup/commandReplies";
import type { TlsReplyReason } from "../model/tlsSetup/commandReplies";
import { patchM552ForTls, patchM586ForTls } from "../model/tlsSetup/configGPatch";
import { CONFIG_G_PATH, TLS_CERT_GENERATOR_URL, TLS_CERT_SD_PATH, TLS_KEY_SD_PATH, TLS_PROTOCOLS } from "../model/tlsSetup/constants";
import { deployTlsEnableInterfaceMacro, TLS_ENABLE_INTERFACE_PATH } from "../model/tlsSetup/interfaceMacro";
import { getCertReminderSettings, setCertExpiryDate, setCertReminderSettings } from "../model/tlsSetup/storage";
import { defaultMachineIO } from "../model/configBackup/machineIO";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();

type Step = "capability" | "generate" | "upload" | "enable" | "persist" | "done";
const step = ref<Step>("capability");

// --- Step 1: capability ------------------------------------------------------------------------------

const capabilities = computed(() => assessTlsCapabilities(machineStore.model as unknown));
const capableInterfaces = computed(() => capabilities.value.filter((c) => c.tls.capable));
const selectedKind = ref<"wifi" | "ethernet" | null>(null);
watch(capableInterfaces, (list) => {
	if (list.length > 0 && !list.some((c) => c.kind === selectedKind.value)) { selectedKind.value = list[0].kind; }
}, { immediate: true });
const selectedInterface = computed(() => capableInterfaces.value.find((c) => c.kind === selectedKind.value) ?? null);

function interfaceLabel(c: InterfaceCapability): string {
	return c.kind === "wifi"
		? i18n.global.t("plugins.flexibleLayouts.tlsSetup.wifiInterface")
		: i18n.global.t("plugins.flexibleLayouts.tlsSetup.ethernetInterface");
}
const CAPABILITY_REASON_KEYS: Record<string, string> = {
	"wifi-firmware-unknown": "plugins.flexibleLayouts.tlsSetup.reason.wifiFirmwareUnknown",
	"wifi-firmware-unparseable": "plugins.flexibleLayouts.tlsSetup.reason.wifiFirmwareUnparseable",
	"wifi-firmware-too-old": "plugins.flexibleLayouts.tlsSetup.reason.wifiFirmwareTooOld",
	"ethernet-board-unsupported": "plugins.flexibleLayouts.tlsSetup.reason.ethernetBoardUnsupported",
};
function capabilityReasonText(c: InterfaceCapability): string {
	const key = c.tls.reason ? CAPABILITY_REASON_KEYS[c.tls.reason] : undefined;
	return key ? i18n.global.t(key, { version: c.firmwareVersion ?? "?" }) : "";
}

// --- Step 2: generate certificate --------------------------------------------------------------------

const hostname = computed(() => (machineStore.model as { network?: { hostname?: string } } | undefined)?.network?.hostname || "duet");
const certValidityDays = ref(3650);
const opensslCommand = computed(() => {
	const ip = selectedInterface.value?.actualIP;
	const san = ip ? `DNS:${hostname.value},IP:${ip}` : `DNS:${hostname.value}`;
	return [
		"openssl ecparam -name prime256v1 -genkey -noout -out server.key",
		"openssl req -new -x509 \\",
		"  -key server.key \\",
		"  -out server.crt \\",
		`  -days ${certValidityDays.value || 3650} \\`,
		`  -subj "/CN=${hostname.value}" \\`,
		`  -addext "subjectAltName=${san}"`,
	].join("\n");
});

/** A small companion file for the standalone "duet-tls-cert-generator" Windows tool - drop it next to
 * the unzipped tool and it generates non-interactively with these exact values, no typing needed. */
function onDownloadArgsFile(): void {
	const payload = {
		hostname: hostname.value,
		ip: selectedInterface.value?.actualIP || undefined,
		days: certValidityDays.value || 3650,
	};
	downloadBlob("duet-cert-args.json", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "application/json");
}

// --- Step 3: upload cert/key --------------------------------------------------------------------------

const keyInput = ref<HTMLInputElement | null>(null);
const certInput = ref<HTMLInputElement | null>(null);
const keyFile = ref<File | null>(null);
const certFile = ref<File | null>(null);
const keyText = ref<string | null>(null);
const certText = ref<string | null>(null);
const keyCheck = computed(() => (keyText.value != null ? checkPrivateKeyPem(keyText.value) : null));
const certCheck = computed(() => (certText.value != null ? checkCertificatePem(certText.value) : null));
const canUpload = computed(() => keyCheck.value?.ok === true && certCheck.value?.ok === true);
const keyFileLabel = computed(() => keyFile.value?.name ?? i18n.global.t("plugins.flexibleLayouts.tlsSetup.noFileChosen"));
const certFileLabel = computed(() => certFile.value?.name ?? i18n.global.t("plugins.flexibleLayouts.tlsSetup.noFileChosen"));

const PEM_REASON_KEYS: Record<PemCheckReason, string> = {
	"not-pem": "plugins.flexibleLayouts.tlsSetup.pemReason.notPem",
	"encrypted-key": "plugins.flexibleLayouts.tlsSetup.pemReason.encryptedKey",
	"wrong-key-type": "plugins.flexibleLayouts.tlsSetup.pemReason.wrongKeyType",
};
function pemReasonText(reason: PemCheckReason | undefined): string {
	return reason ? i18n.global.t(PEM_REASON_KEYS[reason]) : "";
}

async function onKeyFileSelected(ev: Event): Promise<void> {
	const file = (ev.target as HTMLInputElement).files?.[0];
	if (!file) { return; }
	keyFile.value = file;
	keyText.value = await file.text();
}
async function onCertFileSelected(ev: Event): Promise<void> {
	const file = (ev.target as HTMLInputElement).files?.[0];
	if (!file) { return; }
	certFile.value = file;
	certText.value = await file.text();
}

const uploading = ref(false);
const uploadError = ref<string | null>(null);
async function onUploadFiles(): Promise<void> {
	if (!canUpload.value) { return; }
	uploading.value = true;
	uploadError.value = null;
	try {
		const io = defaultMachineIO();
		await io.upload(TLS_KEY_SD_PATH, new Blob([keyText.value!], { type: "text/plain" }));
		await io.upload(TLS_CERT_SD_PATH, new Blob([certText.value!], { type: "text/plain" }));
		// Cache the expiry date locally - on WiFi the SD copy gets wiped once imported into the WiFi
		// module's flash, so this is the only reliable place to read it back from later for the
		// expiry reminder (see certExpiryNudge.ts).
		const expiry = parseCertExpiry(certText.value!);
		if (expiry) { setCertExpiryDate(expiry.toISOString()); }
		step.value = "enable";
	} catch (e) {
		uploadError.value = e instanceof Error ? e.message : String(e);
	} finally {
		uploading.value = false;
	}
}

// --- Step 4: enable TLS on the interface + protocols --------------------------------------------------

const REPLY_REASON_KEYS: Record<TlsReplyReason, string> = {
	"cert-missing": "plugins.flexibleLayouts.tlsSetup.replyReason.certMissing",
	"key-missing": "plugins.flexibleLayouts.tlsSetup.replyReason.keyMissing",
	"mismatched-pair": "plugins.flexibleLayouts.tlsSetup.replyReason.mismatchedPair",
	"wifi-firmware-too-old": "plugins.flexibleLayouts.tlsSetup.replyReason.wifiFirmwareTooOld",
	"wifi-no-material": "plugins.flexibleLayouts.tlsSetup.replyReason.wifiNoMaterial",
	"wifi-rejected": "plugins.flexibleLayouts.tlsSetup.replyReason.wifiRejected",
	unknown: "plugins.flexibleLayouts.tlsSetup.replyReason.unknown",
};
function replyReasonText(reason: TlsReplyReason, raw: string): string {
	return i18n.global.t(REPLY_REASON_KEYS[reason], { raw });
}

const enablingInterface = ref(false);
const interfaceEnableResult = ref<{ ok: boolean; message: string } | null>(null);
async function onEnableInterface(): Promise<void> {
	enablingInterface.value = true;
	interfaceEnableResult.value = null;
	try {
		const io = defaultMachineIO();
		// Deploy the full stop/start cycle (M552 S0, a short settle delay, then M552 T1 S1) as ONE macro
		// up front - RRF's HTTPS setup.md: a native Ethernet MAC needs the cycle because "the LwIP TLS
		// heap is sized at Start() time and a full Stop/Start cycle is needed to resize it"; WiFi's own
		// cert-ROTATION guidance (as opposed to its more general "just re-issue M552 T1 S1" note for
		// other state changes) says the same thing - disable, then re-enable - and this step always
		// follows a fresh upload, i.e. it's rotation every time through this wizard. See
		// interfaceMacro.ts's doc comment for why the whole cycle has to be M98'd as one macro rather
		// than sent as separate live commands.
		if (!(await deployTlsEnableInterfaceMacro(io))) {
			interfaceEnableResult.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.tlsSetup.macroDeployFailed") };
			return;
		}
		// The M552 S0 partway through the macro is expected to drop this very connection before its
		// reply arrives - if so, give the interface a moment to fully restart, then ask again. By then
		// the macro has already completed (S0, the 500ms settle delay, and T1 S1 all run to completion
		// regardless of what happens to this connection), so the retry's reply reflects the outcome
		// without repeating the cycle - unless RRF genuinely never finished it, in which case a second
		// full cycle is the correct thing to attempt anyway.
		let reply: string;
		try {
			reply = await io.sendCode(`M98 P"${TLS_ENABLE_INTERFACE_PATH}"`);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			reply = await io.sendCode(`M98 P"${TLS_ENABLE_INTERFACE_PATH}"`);
		}
		const outcome = interpretTlsReply(reply);
		interfaceEnableResult.value = outcome.ok
			? { ok: true, message: i18n.global.t("plugins.flexibleLayouts.tlsSetup.interfaceEnabled") }
			: { ok: false, message: replyReasonText(outcome.reason, outcome.raw) };
	} catch (e) {
		interfaceEnableResult.value = { ok: false, message: e instanceof Error ? e.message : String(e) };
	} finally {
		enablingInterface.value = false;
	}
}

interface ProtocolChoice { value: 0 | 1 | 2; tlsLabel: string; enabled: boolean; port: number; result: { ok: boolean; message: string } | null }
// STM32-port boards (a third-party RRF fork, e.g. BTT Kraken) have no Telnet responder at all,
// regardless of TLS or interface type - detected via firmwareName (a static compile-time string on
// those forks), not board name (runtime-configurable, doesn't reliably contain "STM32").
const isStm32Board = isStm32PortBoard(getMainboardFirmwareName(machineStore.model as unknown));
const protocolChoices = ref<Array<ProtocolChoice>>(
	TLS_PROTOCOLS.filter((p) => p.value !== 2 || !isStm32Board)
		.map((p) => ({ value: p.value, tlsLabel: p.tlsLabel, enabled: p.value === 0, port: p.defaultTlsPort, result: null })),
);

const enablingProtocols = ref(false);
async function onEnableProtocols(): Promise<void> {
	enablingProtocols.value = true;
	try {
		const io = defaultMachineIO();
		for (const p of protocolChoices.value) {
			if (!p.enabled) { p.result = null; continue; }
			try {
				// Confirmed on real hardware: `M586 P<n> S1 T1` on its own takes the plain (non-TLS)
				// listener for that protocol offline - both the plain and the TLS-enabled line need to be
				// (re-)issued for HTTP and HTTPS (or FTP/FTPS, Telnet/TelnetS) to both be live at once.
				await io.sendCode(`M586 P${p.value} S1`);
				const reply = await io.sendCode(`M586 P${p.value} S1 T1 R${p.port}`);
				const outcome = interpretTlsReply(reply);
				p.result = outcome.ok
					? { ok: true, message: i18n.global.t("plugins.flexibleLayouts.tlsSetup.protocolEnabled") }
					: { ok: false, message: replyReasonText(outcome.reason, outcome.raw) };
			} catch (e) {
				p.result = { ok: false, message: e instanceof Error ? e.message : String(e) };
			}
		}
	} finally {
		enablingProtocols.value = false;
	}
}

// --- Step 5: persist to config.g ----------------------------------------------------------------------

const configText = ref<string | null>(null);
const loadingConfig = ref(false);
const persistError = ref<string | null>(null);
async function loadConfigForPersist(): Promise<void> {
	loadingConfig.value = true;
	persistError.value = null;
	try {
		const io = defaultMachineIO();
		configText.value = await io.downloadText(CONFIG_G_PATH);
	} catch (e) {
		persistError.value = e instanceof Error ? e.message : String(e);
	} finally {
		loadingConfig.value = false;
	}
}
watch(step, (s) => { if (s === "persist" && configText.value == null) { void loadConfigForPersist(); } });

const patchPlan = computed(() => {
	if (configText.value == null) { return null; }
	let text = configText.value;
	const changes: Array<string> = [];
	const m552 = patchM552ForTls(text);
	text = m552.text;
	if (m552.changed) { changes.push(...m552.changes); }
	for (const p of protocolChoices.value) {
		if (p.enabled && p.result?.ok) {
			const m586 = patchM586ForTls(text, p.value, p.port);
			text = m586.text;
			if (m586.changed) { changes.push(...m586.changes); }
		}
	}
	return { text, changes };
});

const applyingPersist = ref(false);
async function onApplyPersist(): Promise<void> {
	if (!patchPlan.value) { return; }
	applyingPersist.value = true;
	persistError.value = null;
	try {
		const io = defaultMachineIO();
		await io.upload(CONFIG_G_PATH, new Blob([patchPlan.value.text], { type: "text/plain" }));
		step.value = "done";
	} catch (e) {
		persistError.value = e instanceof Error ? e.message : String(e);
	} finally {
		applyingPersist.value = false;
	}
}

// --- Step 6: done - expiry reminder settings ----------------------------------------------------------

const reminderSaved = getCertReminderSettings();
const reminderEnabled = ref(reminderSaved.enabled);
const reminderWarningDays = ref(reminderSaved.warningDays);
function saveReminderSettings(): void {
	setCertReminderSettings({ enabled: reminderEnabled.value, warningDays: reminderWarningDays.value || 1 });
}

function close(): void {
	emit("update:modelValue", false);
}
</script>
