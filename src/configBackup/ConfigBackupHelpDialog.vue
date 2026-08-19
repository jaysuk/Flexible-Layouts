<template>
	<v-dialog :model-value="modelValue" max-width="680" scrollable @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-help-circle</v-icon>
				Config backup &amp; restore
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<p>
					<strong>Settings → Flexible Layouts → Backup &amp; restore config</strong> backs up the whole
					machine (<code>sys</code>/<code>macros</code>/<code>filaments</code>, an object-model snapshot,
					and M122 diagnostics). The page has three tabs: <strong>Create backup</strong> (pick what to
					include and where to send it), <strong>Restore</strong> (pick a local file or browse a
					configured destination, choose which files, then apply), and
					<strong>Cloud backup configuration</strong> — where every destination below is set up
					<em>once</em>, with its credentials saved, before it shows up as an option on the other two
					tabs.
				</p>

				<div class="text-title-small mb-1 mt-3">Configuring each destination</div>
				<p class="mb-2">All of this happens on the <strong>Cloud backup configuration</strong> tab. Each
					destination is its own expandable section there with its own fields and a <strong>Save</strong>
					button (except Local, which needs no setup at all).</p>

				<p class="mb-1"><strong>Local (.zip)</strong> — always available. No setup: just pick it as the
					destination on the Create tab and the zip downloads to your PC.</p>

				<p class="mb-1"><strong>Duet backup service</strong></p>
				<ol class="mb-2 ps-4">
					<li>Open the <strong>Duet backup service</strong> section.</li>
					<li>If a <strong>Backup service URL</strong> field is shown, enter the service URL your
						provider gave you (this plugin doesn't run one itself — it's not configured by default).</li>
					<li>Enter your <strong>Email</strong> and <strong>Password</strong> — these are your
						<a href="https://forum.duet3d.com/" target="_blank" rel="noopener">Duet3D forum</a> login
						credentials.</li>
					<li>Click <strong>Sign in</strong>. Only a session token is stored afterwards, never your
						password.</li>
				</ol>
				<p class="text-caption text-medium-emphasis mb-2">2 MB limit per backup (the service's own cap);
					keeps the newest 5 backups per machine by default (configurable once signed in).</p>

				<p class="mb-1"><strong>GitHub</strong></p>
				<ol class="mb-2 ps-4">
					<li>Go to
						<a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">github.com/settings/tokens</a>
						(fine-grained tokens) and click <strong>Generate new token</strong>.</li>
					<li>Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong>
						and pick the one repo you want backups pushed to.</li>
					<li>Under <strong>Permissions → Repository permissions</strong>, set <strong>Contents</strong>
						to <strong>Read and write</strong>. Nothing else is needed.</li>
					<li>Click <strong>Generate token</strong> and copy it — GitHub only shows it once.</li>
					<li>Back in the <strong>GitHub</strong> section here, paste it into
						<strong>Personal access token</strong>, and fill in <strong>Repository</strong> as
						<code>owner/repo</code> and <strong>Branch</strong> (e.g. <code>main</code>).</li>
					<li>Optionally set <strong>Machine name</strong> to override the auto-detected hostname as the
						folder name for this machine's backups — useful with several machines pushing to one repo.</li>
					<li>Click <strong>Save</strong>.</li>
				</ol>
				<p class="text-caption text-medium-emphasis mb-2">Each backup is one commit under
					<code>machines/&lt;name&gt;/backup.zip</code>, so history is fully browsable from the Restore
					tab. Pushing an unredacted backup to a <strong>public</strong> repo is blocked by default
					(typed confirmation required) since it would publish your WiFi password to a permanently
					indexed location.</p>

				<p class="mb-1"><strong>Google Drive</strong></p>
				<ol class="mb-2 ps-4">
					<li>Needs DWC loaded over <strong>HTTPS</strong> (or <code>localhost</code>) — this is a Google
						requirement, not something the plugin can work around on a plain-HTTP printer. Skip this one
						if that's you; see Dropbox/WebDAV below instead.</li>
					<li>In the
						<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console credentials page</a>,
						create (or pick) a project and enable the <strong>Google Drive API</strong> for it.</li>
					<li>Configure the <strong>OAuth consent screen</strong> if prompted (External is fine for
						personal use).</li>
					<li><strong>Create credentials → OAuth client ID</strong>, application type
						<strong>Web application</strong>, and add this DWC's exact origin (e.g.
						<code>https://your-duet.local</code>) under <strong>Authorized JavaScript origins</strong>.</li>
					<li>Copy the generated <strong>Client ID</strong> and paste it into <strong>Google OAuth
						client ID</strong> in the Google Drive section here, then click <strong>Save</strong>.</li>
				</ol>
				<p class="text-caption text-medium-emphasis mb-2">Uses the <code>drive.file</code> scope only, so
					the plugin can only ever see files it created itself, never your other Drive files.</p>

				<p class="mb-1"><strong>Dropbox</strong></p>
				<ol class="mb-2 ps-4">
					<li>Go to the
						<a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener">Dropbox App Console</a>
						and click <strong>Create app</strong>.</li>
					<li>Choose <strong>Scoped access</strong>, pick an access type (App folder is the more
						restrictive/safer option), name the app, and create it.</li>
					<li>On the app's <strong>Permissions</strong> tab, enable <strong>all four</strong> of
						<strong>account_info.read</strong>, <strong>files.metadata.read</strong>,
						<strong>files.content.read</strong> and <strong>files.content.write</strong>, then click
						<strong>Submit</strong>. All four are needed: account_info.read for the Save button below,
						files.metadata.read to list existing backups, and the content ones to upload and restore.</li>
					<li>Back on the <strong>Settings</strong> tab, under <strong>OAuth 2</strong>, click
						<strong>Generate</strong> next to <strong>Generated access token</strong> and copy it — no
						interactive sign-in needed, so it works fine from a plain-HTTP DWC page. Do this
						<em>after</em> setting the permissions above: a token only ever carries the scopes its app
						had at the moment it was generated, so if you change permissions later you must come back
						here and Generate a replacement token — the existing one keeps the old, wrong scopes and
						will keep failing with a 401.</li>
					<li>Paste it into <strong>Access token</strong> in the Dropbox section here and click
						<strong>Save</strong>.</li>
				</ol>

				<p class="mb-1"><strong>WebDAV</strong> <span class="text-caption text-medium-emphasis">(Nextcloud, ownCloud, Synology, or any WebDAV server)</span></p>
				<ol class="mb-2 ps-4">
					<li>Find your server's WebDAV URL — for Nextcloud/ownCloud it's typically
						<code>https://your-server/remote.php/dav/files/USERNAME/</code>; for a Synology NAS, enable
						<strong>WebDAV Station</strong> in Package Center first and use the URL/port it shows you.</li>
					<li>Where the server supports it, create an <strong>app password</strong> instead of using your
						main account password (Nextcloud: personal settings → <strong>Security</strong> →
						<strong>Create new app password</strong>).</li>
					<li>In the <strong>WebDAV</strong> section here, fill in <strong>Server URL</strong>,
						<strong>Username</strong>, and <strong>Password</strong>, then click <strong>Save</strong>.</li>
				</ol>
				<p class="text-caption text-medium-emphasis mb-2">If the server is on a different origin to DWC
					(and isn't a plain-HTTP server on your own network), it needs to allow that origin (CORS) or
					the browser will block the connection — that's a server-side setting, not something this
					plugin controls.</p>

				<div class="text-title-small mb-1 mt-3">What gets redacted</div>
				<p class="mb-1">
					The <strong>Redact sensitive values</strong> switch (Create tab) is <strong>off by default</strong>
					and remembered separately per destination, so a local backup can stay byte-exact while the copy
					you push to GitHub is redacted. With it <strong>off</strong>, the backup restores with no manual
					steps but contains your WiFi and machine passwords in clear. With it <strong>on</strong>, these
					are replaced with a placeholder before the file is written:
				</p>
				<ul class="mb-2 ps-4">
					<li>WiFi credentials (<code>M587</code>, <code>M588</code>, <code>M589</code>), the machine
						password (<code>M551</code>), MQTT credentials (<code>M586.4</code>)</li>
					<li>Network identity (<code>M540</code> MAC, <code>M552</code>/<code>M553</code>/<code>M554</code>
						IP/netmask/gateway, <code>M587</code>'s static-IP params)</li>
					<li><code>set global.X</code> / <code>var X</code> assignments whose name looks like a secret
						(<code>password</code>, <code>token</code>, <code>key</code>, <code>ssid</code>,
						<code>hash</code>, …)</li>
					<li>Common secret patterns in G-code/macro files and plain text: private keys, URL userinfo,
						<code>key=</code>/<code>token=</code> assignments, Telegram/Slack/Discord tokens, JWTs, AWS
						keys, email addresses</li>
					<li>The equivalent identity/network lines in the M122 diagnostics dump</li>
				</ul>
				<p class="text-caption text-medium-emphasis mb-1">
					<strong>JSON config files</strong> (installed plugins' own settings under
					<code>0:/sys/*.json</code>, including Flexible Layouts' own) are redacted by field
					<strong>name</strong> only, not by scanning values for secret-shaped content - a
					<code>password</code>/<code>token</code>/<code>apiKey</code>/<code>hash</code>-named field is
					redacted wherever it appears, but an ordinary value isn't touched just because it happens to look
					like an email address or a URL.
				</p>
				<p class="text-caption text-medium-emphasis mb-2">
					<strong>The machine name (<code>M550</code>) is never redacted</strong> - it's how you identify
					your own machine. The object-model dump's network fields are always privacy-scrubbed regardless
					of this switch, since that's a shared privacy function used by every plugin's diagnostics
					reports. Redaction is per-parameter, not per-line, and a trailing <code>[FL-REDACTED:n]</code> tag
					lets a later restore find and repair each one - see <strong>Restoring a redacted backup</strong>
					in the Restore tab's repair step for how that works.
				</p>

				<div class="text-title-small mb-1 mt-3">A few other things on this page</div>
				<p class="mb-0">
					<strong>Credential storage &amp; encryption</strong> (top of the Configuration tab) can
					AES-encrypt every saved destination credential behind a passphrase, with optional cross-device
					sync via the printer's SD card or an exported file. <strong>Automatic reminders</strong> (bottom
					of the same tab) can show a one-click toast — never a silent upload — when <code>config.g</code>
					changes, a backup is overdue, or an unbacked-up machine connects. Restore supports picking
					individual files and restoring a backup taken on a different machine (e.g. after a mainboard
					swap). See
					<a href="https://github.com/jaysuk/Flexible-Layouts/blob/main/docs/config-backup.md" target="_blank" rel="noopener">docs/config-backup.md</a>
					for the full details.
				</p>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn color="card-actions" @click="close">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function close(): void {
	emit("update:modelValue", false);
}
</script>
