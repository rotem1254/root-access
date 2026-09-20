// TEST-ONLY: the plaintext flag and canonical solution live here, never in the bundle.
export const FLAG = 'FLAG{r00t3d_0ut_th3_b34c0n}';
export const SSH_PASSWORD = 'w3b-adm1n-2026';

/** ssh asks the host-key question then the password; the runner answers both. */
export const SOLUTION: readonly string[] = [
  'ssh webadmin@corp-web-03',
  'ps aux',
  'kill -9 4021',
  'cat /etc/nova/agent.conf',
  'export RECOVER_AS=nova-7731',
  'mkdir /home/webadmin/recovered',
  'mv /var/spool/nova/staged.dat /home/webadmin/recovered/nova-7731',
  `submit ${FLAG}`,
];

/** The staged file itself is a decoy; only the correct recovery reveals the flag. */
export const SHORTCUTS_THAT_FAIL: readonly string[] = ['cat /var/spool/nova/staged.dat'];
