/**
 * Resolve a user-entered URL for an iframe/fetch.
 *
 * A bare host like `example.com` (no scheme) is treated by the browser as a RELATIVE url, so it gets
 * resolved against the Duet's origin - which tries to load it from the board's SD card instead of the
 * external site. Prepend `https://` when the value is a bare host, while leaving real schemes
 * (`http:`/`https:`/`data:`…), protocol-relative (`//…`) and root-relative paths (`/…`) untouched.
 */
export function resolveExternalUrl(raw: string | undefined | null): string {
	const url = (raw ?? "").trim();
	if (!url) {
		return "";
	}
	if (/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) {
		return url;
	}
	return `https://${url}`;
}
