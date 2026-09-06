/** Fixed SD-card locations RRF's HTTPS setup.md expects for the server key/certificate. */
export const TLS_KEY_SD_PATH = "0:/sys/server.key";
export const TLS_CERT_SD_PATH = "0:/sys/server.crt";

export const CONFIG_G_PATH = "0:/sys/config.g";

/** Standalone Windows tool referenced by generateWindowsToolIntro/-Note below - generates the same
 *  key/cert pair as the openssl commands shown alongside it, for users without openssl on PATH. */
export const TLS_CERT_GENERATOR_URL = "https://github.com/jaysuk/duet-tls-cert-generator";

export interface TlsProtocolDef {
	value: 0 | 1 | 2;
	code: string;
	plainLabel: string;
	tlsLabel: string;
	defaultTlsPort: number;
}

export const TLS_PROTOCOLS: ReadonlyArray<TlsProtocolDef> = [
	{ value: 0, code: "M586 P0", plainLabel: "HTTP", tlsLabel: "HTTPS", defaultTlsPort: 443 },
	{ value: 1, code: "M586 P1", plainLabel: "FTP", tlsLabel: "FTPS", defaultTlsPort: 990 },
	{ value: 2, code: "M586 P2", plainLabel: "Telnet", tlsLabel: "TelnetS", defaultTlsPort: 992 },
];
