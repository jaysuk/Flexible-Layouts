/**
 * Turning a G-code REPLY into a thrown error.
 *
 * `machineStore.sendCode()` resolves with RepRapFirmware's reply text; it only rejects on transport
 * failures (bad HTTP response, full code buffer, disconnection). A code that RRF itself refused -
 * bad parameter, unknown value in a macro expression, probe never triggered, move out of bounds -
 * comes back as an ordinary resolved string beginning "Error: ". Confirmed in the connector source:
 * `PollConnector.sendCode` pushes `{ seq, resolve, reject }` and `getGCodeReply` calls
 * `code.resolve(reply)` unconditionally, whatever the reply says.
 *
 * So `try { await sendCode(...) } catch { ... }` around a command that FAILED is dead code, and the
 * success path runs regardless - which is how a probe macro that aborted before it moved at all
 * could still report "Corner probed". Wrap the call in {@link sendCodeChecked} instead.
 *
 * The "Error: " / "Warning: " prefixes are RRF's own convention, and matching on them is exactly what
 * DWC's own `useUiStore().logCode` does to pick a log severity (src/stores/ui.ts) - this mirrors that
 * rather than inventing a second, divergent notion of what a failed reply looks like.
 */

/** Whether a resolved G-code reply is RRF reporting a failure. */
export function isErrorReply(reply: string | null | undefined): boolean {
	return typeof reply === "string" && reply.trimStart().startsWith("Error: ");
}

/** Whether a resolved G-code reply is RRF reporting a non-fatal warning. */
export function isWarningReply(reply: string | null | undefined): boolean {
	return typeof reply === "string" && reply.trimStart().startsWith("Warning: ");
}

/**
 * Send a code and throw if RRF answered with an error, so a caller's existing try/catch actually
 * covers G-code failures and not just transport ones. Returns the reply otherwise (a warning is
 * passed through unchanged - it means the command ran).
 *
 * `sender` is passed in rather than importing the machine store here so this stays a pure,
 * directly-testable function; every caller already holds a `machineStore`.
 */
export async function sendCodeChecked(
	sender: (code: string) => Promise<string>, code: string,
): Promise<string> {
	const reply = await sender(code);
	if (isErrorReply(reply)) {
		// Trim RRF's own prefix - callers put this straight into a UI alert that already says
		// something failed, so repeating "Error:" there just reads as a stutter.
		throw new Error(reply.trimStart().slice("Error: ".length).trim() || reply.trim());
	}
	return reply;
}
