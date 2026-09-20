export const FLAG = 'FLAG{full_k1ll_ch41n}';
export const SUDO_PASSWORD = 'gu3st-p4ss';
export const SOLUTION: readonly string[] = [
  'ps aux',
  'kill -9 6666',
  'find / -name "*.conf" 2>/dev/null',
  'cat /var/tmp/.harvest/exfil.conf',
  'sudo cat /root/loot.txt',
  SUDO_PASSWORD,
  `submit ${FLAG}`,
];
// The loot is root-only, so reading it directly as guest is refused.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat /root/loot.txt'];
