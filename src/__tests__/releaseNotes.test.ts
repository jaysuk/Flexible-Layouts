import { describe, expect, it } from "vitest";

import { linkifyReleaseNotes } from "../util/releaseNotes";

describe("linkifyReleaseNotes", () => {
	it("converts a Markdown link into a real anchor, wherever it appears in the notes", () => {
		const html = linkifyReleaseNotes("- add a widget ([b667167](https://github.com/jaysuk/Flexible-Layouts/commit/b667167))");
		expect(html).toContain('<a href="https://github.com/jaysuk/Flexible-Layouts/commit/b667167" target="_blank" rel="noopener" class="wn-ref">b667167</a>');
		expect(html).not.toContain("[b667167]");
	});

	it("converts every link on a line with more than one, and multiple lines", () => {
		const html = linkifyReleaseNotes(
			"- one [a](https://example.com/a) two [b](https://example.com/b)\n- [c](https://example.com/c)",
		);
		expect(html).toContain('<a href="https://example.com/a"');
		expect(html).toContain('<a href="https://example.com/b"');
		expect(html).toContain('<a href="https://example.com/c"');
	});

	it("still applies the underlying formatter's own transforms (headings, bold, bullets)", () => {
		const html = linkifyReleaseNotes("## ✨ Features\n- **bold** and `code`");
		expect(html).toContain("<h4");
		expect(html).toContain("✨ Features");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<code>code</code>");
	});

	it("leaves notes with no links untouched by the linkify step", () => {
		const html = linkifyReleaseNotes("- plain bullet, no link here");
		expect(html).toContain("plain bullet, no link here");
		expect(html).not.toContain("<a ");
	});

	it("HTML-escapes text around a link (no injection via the underlying formatter)", () => {
		const html = linkifyReleaseNotes('- <script>alert(1)</script> [x](https://example.com/x)');
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain('<a href="https://example.com/x"');
	});
});
