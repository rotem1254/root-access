export const FLAG = 'FLAG{h0pp3d_th3_n3tw0rk}';
export const SSH_PASSWORD = 'network-2026';
export const SOLUTION: readonly string[] = [
  'ip a',
  'ping 10.10.0.20',
  'nmap 10.10.0.20',
  'ssh operator@10.10.0.20',
  'cat flag.txt',
  `submit ${FLAG}`,
];
// The flag lives on the remote machine, so it cannot be read without logging in.
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat flag.txt'];
