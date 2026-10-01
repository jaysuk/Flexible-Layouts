<!-- Asks for a line of text and a FIGlet font and hands them back; the editor turns it into a banner of `;` comment lines (dwc-gcode-editor's asciiArt.ts). Fonts: model/bannerFonts.ts. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderAsciiArt } from "dwc-gcode-editor";
import {
	DEFAULT_BANNER_FONT, ensureBannerFont, listBannerFonts, loadBannerFontChoice, saveBannerFontChoice,
} from "../model/bannerFonts";

const props = defineProps<{
	modelValue: boolean;
	/** Passed straight to `v-dialog` - only so a test can find the teleported content. */
	attach?: boolean | string;
}>();

const emit = defineEmits<{
	"update:modelValue": [open: boolean];
	/** The text to turn into a banner (never empty) and the FIGlet font to draw it in. */
	insert: [text: string, font: string];
}>();

const text = ref("");
const fonts = ref<string[]>([DEFAULT_BANNER_FONT]);
const font = ref(DEFAULT_BANNER_FONT);
// The font the preview is drawn in: it lags `font` until that font has been parsed (it is fetched on first use).
const readyFont = ref(DEFAULT_BANNER_FONT);

// A fresh dialog each time it opens (the font is the one this browser used last).
watch(() => props.modelValue, async (open) => {
	if (!open) return;
	text.value = "";
	font.value = loadBannerFontChoice();
	const list = await listBannerFonts();
	fonts.value = list;
	if (!list.includes(font.value)) font.value = DEFAULT_BANNER_FONT;
}, { immediate: true });

watch(font, async (chosen) => {
	const ok = await ensureBannerFont(chosen);
	if (font.value !== chosen) return; // a newer pick has overtaken this one
	if (ok) readyFont.value = chosen;
	else font.value = DEFAULT_BANNER_FONT;
}, { immediate: true });

// FIGlet throws on a character its font has no glyph for; the preview just goes blank rather than the dialog failing.
const preview = computed(() => {
	if (text.value.trim() === "") return "";
	try {
		return renderAsciiArt(text.value, { font: readyFont.value });
	} catch {
		return "";
	}
});

function close(): void {
	emit("update:modelValue", false);
}

function confirm(): void {
	if (preview.value === "") return;
	saveBannerFontChoice(readyFont.value);
	emit("insert", text.value, readyFont.value);
	close();
}
</script>

<style scoped>
/* Vuetify's subtitle is one line with an ellipsis; this hint is a sentence or two. */
.banner-hint {
	white-space: normal;
}

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
			<v-card-subtitle class="banner-hint">{{ $t("plugins.flexibleLayouts.gcodeEditor.asciiArtHint") }}</v-card-subtitle>
			<v-card-text>
				<v-text-field v-model="text" autofocus clearable hide-details class="mb-3" data-ascii-art-text
							  :label="$t('plugins.flexibleLayouts.gcodeEditor.asciiArtText')" @keydown.enter.prevent="confirm" />
				<v-autocomplete v-model="font" :items="fonts" hide-details class="mb-3" data-ascii-art-font
								:label="$t('plugins.flexibleLayouts.gcodeEditor.asciiArtFont', { count: fonts.length })" />
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
