export const FLAG = 'FLAG{w1th_gr34t_p0w3r}';
/** The account's own password, entered at the sudo prompt. */
export const PASSWORD = 'cadet';
export const SOLUTION: readonly string[] = [
  'whoami',
  'id',
  'cat /root/flag.txt',
  'sudo cat /root/flag.txt',
  PASSWORD,
  `submit ${FLAG}`,
];
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat /root/flag.txt'];
