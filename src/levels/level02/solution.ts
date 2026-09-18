// TEST-ONLY: plaintext flag and canonical solution.
import { STAGED_PATH } from './authlog';

export const FLAG = 'FLAG{n33dl3_1n_th3_l0gs}';

export const SOLUTION: readonly string[] = [
  'grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn',
  'grep 203.0.113.47 /var/log/auth.log | grep Accepted',
  'grep mreyes /var/log/auth.log | grep COMMAND',
  `cat ${STAGED_PATH}`,
  `submit ${FLAG}`,
];

export const SHORTCUTS_THAT_FAIL: readonly string[] = [
  'ls /home/mreyes',
  'grep -r FLAG /home',
  'find /home -name "*.csv"',
];
