<!-- Asks for a line of text and hands it back; the editor turns it into a banner of `;` comment lines (dwc-gcode-editor's asciiArt.ts). -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderAsciiArt } from "dwc-gcode-editor";

const props = defineProps<{
	modelValue: boolean;
	/** Passed straight to `v-dialog` - only so a test can find the teleported content. */
	attach?: boolean | string;
}>();

const emit = defineEmits<{
	"update:modelValue": [open: boolean];
	/** The text to turn into a banner (never empty). */
	insert: [text: string];
}>();

const text = ref("");

// A fresh dialog each time it opens.
watch(() => props.modelValue, (open) => { if (open) text.value = ""; });

// FIGlet throws on a character its font has no glyph for; the preview just goes blank rather than the dialog failing.
const preview = computed(() => {
	if (text.value.trim() === "") return "";
	try {
		return renderAsciiArt(text.value);
	} catch {
		return "";
	}
});

function close(): void {
	emit("update:modelValue", false);
}

function confirm(): void {
	if (preview.value === "") return;
	emit("insert", text.value);
	close();
}
</script>

<style scoped>
.banner-preview {
	margin: 0;
	padding: 0.5rem;
	min-block-size: 4rem;
	max-block-size: 14rem;
	overflow: auto;
	font-family: monospace;
	font-size: 0.8125rem;
	white-space: pre;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 4px;
}
</style>

<template>
	<v-dialog :model-value="modelValue" max-width="40rem" :attach="props.attach" @update:model-value="close">
		<v-card :title="$t('plugins.flexibleLayouts.gcodeEditor.asciiArtTitle')">
			<v-card-subtitle>{{ $t("plugins.flexibleLayouts.gcodeEditor.asciiArtHint") }}</v-card-subtitle>
			<v-card-text>
				<v-text-field v-model="text" autofocus clearable hide-details class="mb-3" data-ascii-art-text
							  :label="$t('plugins.flexibleLayouts.gcodeEditor.asciiArtText')" @keydown.enter.prevent="confirm" />
				<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.gcodeEditor.asciiArtPreview") }}</div>
				<pre class="banner-preview" data-ascii-art-preview>{{ preview }}</pre>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="close">{{ $t("plugins.flexibleLayouts.gcodeEditor.asciiArtCancel") }}</v-btn>
				<v-btn color="primary" :disabled="preview === ''" data-ascii-art-insert @click="confirm">
					{{ $t("plugins.flexibleLayouts.gcodeEditor.asciiArtInsert") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>
