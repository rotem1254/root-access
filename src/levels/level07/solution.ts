// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{cl34rt3xt_c0nf3ss10ns}';

/** The credential the capture leaks: svc-export:Exp0rt-Str3am-2026 (base64 in Basic auth). */
export const PORTAL_USER = 'svc-export';
export const PORTAL_PASSWORD = 'Exp0rt-Str3am-2026';
export const BASIC_TOKEN = 'c3ZjLWV4cG9ydDpFeHAwcnQtU3RyM2FtLTIwMjY=';

export const SOLUTION: readonly string[] = [
  'tcpdump -r /var/captures/export-run.pcap',
  'tcpdump -r /var/captures/export-run.pcap | grep -i authorization',
  `echo ${BASIC_TOKEN} | base64 -d`,
  `curl -u ${PORTAL_USER}:${PORTAL_PASSWORD} http://corp-portal:8080/admin`,
  `submit ${FLAG}`,
];

/** Obvious shortcuts that must NOT reveal or accept the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'curl http://corp-portal:8080/admin',
  'curl -u svc-export:password http://corp-portal:8080/admin',
  'grep -r FLAG /var/captures',
];
