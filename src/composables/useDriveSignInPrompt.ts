/**
 * The Google Drive device-flow sign-in prompt's shared state - a module-level reactive singleton,
 * mirroring DWC's own `useConfirmDialog.ts` pattern (a plain `reactive` object any code can push into,
 * consumed by a single always-mounted dialog component - see GoogleDriveSignInDialog.vue). Needed
 * because `googleDriveAuth.ts`'s device-flow sign-in is a plain async function, not a component, so it
 * has no dialog of its own to show - it just updates this singleton and the mounted dialog reflects it.
 *
 * Fixes two real reported bugs in the first version of this flow:
 *
 * 1. The device code was surfaced via `uiStore.log()` - DWC's toast notification, which auto-dismisses.
 *    A user who read the code, switched to another tab to enter it at Google's verification page, and
 *    came back to Flexible Layouts found the toast already gone (only recoverable via DWC's Console
 *    page history). The code needs to stay on screen for exactly as long as the user needs it, which a
 *    toast's timeout can never guarantee - hence a real, `persistent` `v-dialog` (no backdrop-click/
 *    escape dismiss) that closes ONLY on an explicit user action, never on a timer.
 *
 * 2. If the user never completes the Google sign-in, the backup used to just sit there indefinitely
 *    (Google's own device-code expiry is ~30 minutes - correct as an upper bound, but far too long to
 *    leave someone with no way out if they change their mind). `cancelDriveSignIn` (below) gives the
 *    poll loop an explicit signal to stop and fail the backup cleanly, distinct from `closeDriveSignInPrompt`
 *    (which just dismisses an already-resolved dialog without touching a still-running operation).
 */
import { reactive } from "vue";

export type DriveSignInStatus = "waiting" | "authorized" | "denied" | "expired" | "error";

interface DriveSignInPromptState {
	open: boolean;
	userCode: string;
	verificationUrl: string;
	status: DriveSignInStatus;
	/** Only meaningful for status "error" - the specific message from pollDeviceToken. */
	message: string;
}

const state = reactive<DriveSignInPromptState>({
	open: false, userCode: "", verificationUrl: "", status: "waiting", message: "",
});

/** Set by `openDriveSignInPrompt`, invoked by `cancelDriveSignIn` - the poll loop checks a flag this
 *  callback flips, rather than this module calling into the poll loop directly (which would need to
 *  know about it, inverting the dependency this composable otherwise has no reason to have). */
let cancelHandler: (() => void) | null = null;

/** Opens the prompt with a fresh code. Always starts at "waiting" - callers update the status as the
 *  poll loop progresses via `updateDriveSignInStatus`, they never re-open. `onCancel` is invoked if the
 *  user clicks Cancel while still "waiting" - see `cancelDriveSignIn`. */
export function openDriveSignInPrompt(userCode: string, verificationUrl: string, onCancel: () => void): void {
	state.open = true;
	state.userCode = userCode;
	state.verificationUrl = verificationUrl;
	state.status = "waiting";
	state.message = "";
	cancelHandler = onCancel;
}

/** Updates the SAME open dialog instance live as sign-in progresses, rather than replacing it - so a
 *  prompt the user is already looking at reflects the real outcome instead of going stale. Safe to call
 *  even if the user already dismissed it (closeDriveSignInPrompt) - it just updates state nothing is
 *  currently rendering. */
export function updateDriveSignInStatus(status: DriveSignInStatus, message = ""): void {
	state.status = status;
	state.message = message;
}

/** Called ONLY while status is "waiting" (GoogleDriveSignInDialog.vue's button reads as "Cancel" in
 *  that state) - actually aborts the in-progress sign-in via the registered handler, then closes the
 *  dialog. This is what gives the user a real way out instead of "wait up to 30 minutes for Google's
 *  own device-code expiry" (the real bug this fixes - see the module doc comment). */
export function cancelDriveSignIn(): void {
	cancelHandler?.();
	closeDriveSignInPrompt();
}

/** Dismisses the dialog WITHOUT touching a still-running operation - correct once status has already
 *  reached a terminal state (authorized/denied/expired/error), where the button reads "OK". Also used
 *  as `cancelDriveSignIn`'s own final step. */
export function closeDriveSignInPrompt(): void {
	state.open = false;
}

export function useDriveSignInPromptState(): DriveSignInPromptState {
	return state;
}

/** Test-only: resets the module-level singleton between tests, same convention as this repo's other
 *  resettable singletons (e.g. maintenance/historySettings.ts's own resetForTests). */
export function resetForTests(): void {
	state.open = false;
	state.userCode = "";
	state.verificationUrl = "";
	state.status = "waiting";
	state.message = "";
	cancelHandler = null;
}
