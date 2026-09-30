<template>
	<v-dialog :model-value="modelValue" max-width="520" scrollable :attach="props.attach"
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-layers-triple</v-icon>
				{{ $t("plugins.flexibleLayouts.profiles.title") }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.close')" icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh; overflow-x: hidden;">
				<div class="text-caption text-medium-emphasis mb-3">
					{{ $t("plugins.flexibleLayouts.profiles.help") }}
				</div>

				<!-- Automatic switching: a per-device opt-in, and what it last did on this device. -->
				<v-sheet class="pa-3 mb-4 rounded auto-profile-box" border>
					<v-switch :model-value="autoProfileEnabled" color="primary" density="compact" hide-details class="auto-profile-switch"
							  :label="$t('plugins.flexibleLayouts.profiles.auto.enable')" @update:model-value="setAutoProfileEnabled($event === true)" />
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.profiles.auto.enableHint") }}</div>
					<div v-if="lastSwitch" class="text-caption mt-2 auto-profile-last">
						{{ $t("plugins.flexibleLayouts.profiles.auto.last", { name: lastSwitch.profileName, time: lastSwitchTime, why: lastSwitchWhy }) }}
					</div>
					<div v-if="differsFromShared" class="d-flex align-center ga-2 mt-2 auto-profile-differs">
						<span class="text-caption flex-grow-1">{{ $t("plugins.flexibleLayouts.profiles.auto.differs", { shared: sharedName }) }}</span>
						<v-btn size="x-small" variant="tonal" class="auto-profile-follow" @click="onFollowShared">{{ $t("plugins.flexibleLayouts.profiles.auto.follow") }}</v-btn>
					</div>
				</v-sheet>

				<v-sheet class="pa-3 mb-4 rounded" border>
					<div class="d-flex ga-2">
						<v-text-field v-model="newName" density="compact" variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.profiles.newName')" />
						<v-btn color="primary" size="small" prepend-icon="mdi-plus" :disabled="!newName.trim()"
							   @click="onCreate">
							{{ $t("plugins.flexibleLayouts.profiles.create") }}
						</v-btn>
					</div>
				</v-sheet>

				<v-list density="compact">
					<v-list-item v-for="p in profiles" :key="p.id"
								 :prepend-icon="p.id === activeId ? 'mdi-check-circle' : 'mdi-circle-outline'"
								 :title="p.name" :subtitle="autoSummary(p.id)" :data-profile="p.id"
								 :class="{ 'text-primary': p.id === activeId }" @click="onSwitch(p.id)">
						<template #append>
							<v-btn icon="mdi-robot-outline" size="x-small" variant="text" density="comfortable" class="profile-auto-btn"
								   :color="ruleFor(p.id) ? 'primary' : undefined"
								   :title="$t('plugins.flexibleLayouts.profiles.auto.edit')" :aria-label="$t('plugins.flexibleLayouts.profiles.auto.edit')"
								   @click.stop="startRule(p)" />
							<v-btn icon="mdi-pencil" size="x-small" variant="text" density="comfortable"
								   :title="$t('plugins.flexibleLayouts.pages.rename')" @click.stop="startRename(p)" />
							<v-btn icon="mdi-content-copy" size="x-small" variant="text" density="comfortable"
								   :title="$t('plugins.flexibleLayouts.editor.duplicate')" @click.stop="onDuplicate(p)" />
							<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable" color="error"
								   :disabled="profiles.length <= 1"
								   :title="$t('plugins.flexibleLayouts.profiles.delete')" @click.stop="onDelete(p)" />
						</template>
					</v-list-item>
				</v-list>
			</v-card-text>
		</v-card>

		<v-dialog v-model="ruleOpen" max-width="460" :attach="props.attach">
			<v-card v-if="ruleDraft">
				<v-card-title>{{ $t("plugins.flexibleLayouts.profiles.auto.ruleTitle", { name: ruleName }) }}</v-card-title>
				<v-card-text>
					<v-select v-model="ruleDraft.kind" :items="ruleKindItems" density="compact" variant="outlined" hide-details class="rule-kind"
							  :label="$t('plugins.flexibleLayouts.profiles.auto.when')" />
					<v-select v-if="ruleDraft.kind === 'machineMode'" v-model="ruleDraft.mode" :items="modeItems" density="compact" variant="outlined"
							  hide-details class="mt-2 rule-mode" :label="$t('plugins.flexibleLayouts.profiles.auto.mode')" />
					<template v-if="ruleDraft.kind === 'condition'">
						<OmPathField v-model="ruleDraft.omPath" class="mt-2" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
						<div class="d-flex ga-2 mt-2">
							<v-select v-model="ruleDraft.operator" :items="operatorOptions" density="compact" variant="outlined" hide-details
									  style="max-width: 170px" :label="$t('plugins.flexibleLayouts.conditions.operator')" />
							<v-text-field v-if="ruleDraft.operator !== 'truthy' && ruleDraft.operator !== 'falsy'" v-model="ruleDraft.value" density="compact"
										  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.conditions.value')" />
						</div>
					</template>
					<template v-if="ruleDraft.kind !== 'none'">
						<v-switch v-model="ruleDraft.returnWhenEnds" color="primary" density="compact" hide-details class="mt-2 rule-return"
								  :label="$t('plugins.flexibleLayouts.profiles.auto.returnWhenEnds')" />
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.profiles.auto.returnHint") }}</div>
					</template>
					<div class="text-caption text-medium-emphasis mt-3">{{ $t("plugins.flexibleLayouts.profiles.auto.ruleNote") }}</div>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="ruleOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" class="rule-save" @click="saveRule">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-dialog v-model="deleteOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.profiles.delete") }}</v-card-title>
				<v-card-text>{{ $t("plugins.flexibleLayouts.profiles.deleteConfirm", { name: deleteName }) }}</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="deleteOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="error" @click="confirmDelete">{{ $t("plugins.flexibleLayouts.profiles.delete") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-dialog v-model="renameOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pages.rename") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="renameValue" density="compact" variant="outlined" autofocus
								  :label="$t('plugins.flexibleLayouts.profiles.newName')" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="renameOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" :disabled="!renameValue.trim()" @click="saveRename">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import i18n from "@/i18n";

import {
	createProfile,
	duplicateProfile,
	ensureProfiles,
	getActiveProfileId,
	getSharedActiveProfileId,
	listProfiles,
	renameProfile,
	setProfileAutoSwitch,
	useLayoutStore,
} from "../model/store";
import type { AutoSwitchRule, ConditionOperator } from "../model/document";
import { autoProfileEnabled, lastAutoSwitch, setAutoProfileEnabled } from "../model/autoProfile";
import { deleteProfileAndSwitch, followSharedProfile, switchProfile } from "../model/profiles";
import OmPathField from "./OmPathField.vue";

// `attach` is a plain pass-through to the rule dialog's v-dialog, left unset in real use (tests only).
const props = defineProps<{ modelValue: boolean; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const router = useRouter();

const newName = ref("");
// Re-read reactively each render (the underlying maps are Pinia-reactive).
const profiles = computed(() => { void props.modelValue; return listProfiles(); });
const activeId = computed(() => { void profiles.value; return getActiveProfileId(); });

function onCreate() {
	const name = newName.value.trim();
	if (!name) {
		return;
	}
	const id = createProfile(name);
	newName.value = "";
	onSwitch(id);
}

function onSwitch(id: string) {
	if (id === getActiveProfileId()) {
		return;
	}
	switchProfile(id);
	// Custom pages differ between profiles, so land on the dashboard to avoid a stale route.
	router.push("/").catch(() => { /* already there */ });
}

// ---- automatic switching ----------------------------------------------------------------------------
const lastSwitch = computed(() => lastAutoSwitch.value);
const lastSwitchTime = computed(() => (lastSwitch.value ? new Date(lastSwitch.value.at).toLocaleTimeString() : ""));
const lastSwitchWhy = computed(() => {
	const r = lastSwitch.value?.reason;
	return r ? i18n.global.t(`plugins.flexibleLayouts.profiles.auto.reason.${r.kind}`, { value: r.value ?? "" }) : "";
});
const differsFromShared = computed(() => { void profiles.value; return getActiveProfileId() !== getSharedActiveProfileId(); });
const sharedName = computed(() => profiles.value.find((p) => p.id === getSharedActiveProfileId())?.name ?? "");
function onFollowShared() {
	followSharedProfile();
	router.push("/").catch(() => { /* already there */ });
}

const layoutStore = useLayoutStore();
function ruleFor(id: string): AutoSwitchRule | undefined {
	void layoutStore.document.value; // re-read when the layout changes
	return ensureProfiles().profiles[id]?.meta.autoSwitch;
}
function autoSummary(id: string): string | undefined {
	const rule = ruleFor(id);
	if (!rule) { return undefined; }
	const base = rule.on === "machineMode"
		? i18n.global.t("plugins.flexibleLayouts.profiles.auto.summary.machineMode", { value: rule.value })
		: i18n.global.t(`plugins.flexibleLayouts.profiles.auto.summary.${rule.on}`);
	return base;
}

interface RuleDraft { kind: "none" | "machineMode" | "printing" | "condition"; mode: "FFF" | "CNC" | "Laser"; omPath: string; operator: ConditionOperator; value: string; returnWhenEnds: boolean }
const ruleOpen = ref(false);
const ruleId = ref("");
const ruleName = ref("");
const ruleDraft = ref<RuleDraft | null>(null);
const tt = (key: string) => i18n.global.t(`plugins.flexibleLayouts.${key}`);
const ruleKindItems = computed(() => [
	{ title: tt("profiles.auto.kind.none"), value: "none" },
	{ title: tt("profiles.auto.kind.machineMode"), value: "machineMode" },
	{ title: tt("profiles.auto.kind.printing"), value: "printing" },
	{ title: tt("profiles.auto.kind.condition"), value: "condition" },
]);
const modeItems = [{ title: "FFF (3D printer)", value: "FFF" }, { title: "CNC", value: "CNC" }, { title: "Laser", value: "Laser" }];
const operatorOptions = computed<Array<{ title: string; value: ConditionOperator }>>(() => (["eq", "ne", "gt", "lt", "gte", "lte", "contains", "truthy", "falsy"] as const)
	.map((op) => ({ title: tt(`conditions.${op}`), value: op })));

function startRule(p: { id: string; name: string }) {
	const rule = ruleFor(p.id);
	ruleId.value = p.id;
	ruleName.value = p.name;
	ruleDraft.value = {
		kind: rule?.on ?? "none",
		mode: rule?.on === "machineMode" ? rule.value : "CNC",
		omPath: rule?.on === "condition" ? rule.rule.omPath : "",
		operator: rule?.on === "condition" ? rule.rule.operator : "truthy",
		value: rule?.on === "condition" ? String(rule.rule.value ?? "") : "",
		returnWhenEnds: !!rule?.returnWhenEnds,
	};
	ruleOpen.value = true;
}
function saveRule() {
	const d = ruleDraft.value;
	if (!d) { return; }
	let rule: AutoSwitchRule | undefined;
	const back = d.returnWhenEnds ? { returnWhenEnds: true } : {};
	if (d.kind === "machineMode") { rule = { on: "machineMode", value: d.mode, ...back }; }
	else if (d.kind === "printing") { rule = { on: "printing", ...back }; }
	else if (d.kind === "condition" && d.omPath.trim()) {
		rule = { on: "condition", rule: { omPath: d.omPath.trim(), operator: d.operator, ...(d.operator === "truthy" || d.operator === "falsy" ? {} : { value: d.value }) }, ...back };
	}
	setProfileAutoSwitch(ruleId.value, rule);
	ruleOpen.value = false;
}

function onDuplicate(p: { id: string; name: string }) {
	const id = duplicateProfile(p.id, `${p.name} copy`);
	onSwitch(id);
}

const deleteOpen = ref(false);
const deleteId = ref("");
const deleteName = ref("");
function onDelete(p: { id: string; name: string }) {
	deleteId.value = p.id;
	deleteName.value = p.name;
	deleteOpen.value = true;
}
function confirmDelete() {
	deleteProfileAndSwitch(deleteId.value);
	deleteOpen.value = false;
	router.push("/").catch(() => { /* already there */ });
}

// Rename sub-dialog
const renameOpen = ref(false);
const renameId = ref("");
const renameValue = ref("");
function startRename(p: { id: string; name: string }) {
	renameId.value = p.id;
	renameValue.value = p.name;
	renameOpen.value = true;
}
function saveRename() {
	renameProfile(renameId.value, renameValue.value.trim());
	renameOpen.value = false;
}
</script>
