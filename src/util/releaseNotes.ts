/**
 * dwc-plugin-runtime's formatReleaseNotesHtml() HTML-escapes the raw release-notes markdown, then
 * applies its own bold/code/heading/bullet transforms - but never converts `[text](url)` links, so
 * every commit reference (GitHub's auto-generated release notes are full of them) rendered as
 * literal `[hash](url)` text instead of a link. Fixed locally here rather than in the (external,
 * node_modules) package: escaping never touches `[`]`(`)` characters, so the markdown link syntax
 * survives intact in the formatter's own HTML output for this regex to catch afterwards, regardless
 * of which block (bullet/heading/paragraph) it landed in.
 */
import { formatReleaseNotesHtml } from "dwc-plugin-runtime";

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;

export function linkifyReleaseNotes(markdown: string): string {
	return formatReleaseNotesHtml(markdown).replace(MARKDOWN_LINK, '<a href="$2" target="_blank" rel="noopener" class="wn-ref">$1</a>');
}
