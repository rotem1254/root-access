import { createRandom } from '../../engine/util/prng';

/** The compromised account and the attacker IP the player must discover from the log. */
export const ATTACKER_IP = '203.0.113.47';
export const COMPROMISED_USER = 'mreyes';
export const STAGED_PATH = '/home/mreyes/.cache/.q3-review.csv';

const HOST = 'corp-fs-01';
const MONTHS = ['Jan', 'Feb', 'Mar'];

/** A syslog timestamp `Mar  4 03:12:45`, built from a running minute counter. */
function stamp(minute: number, second: number): string {
  const day = 3 + Math.floor(minute / (24 * 60));
  const mm = minute % (24 * 60);
  const hh = Math.floor(mm / 60);
  const mi = mm % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dayStr = String(day).padStart(2, ' ');
  return `${MONTHS[2]} ${dayStr} ${pad(hh)}:${pad(mi)}:${pad(second)}`;
}

/**
 * Generates a realistic /var/log/auth.log (~600 lines). Deterministic for a fixed seed, so the
 * puzzle is identical on every run. The attacker's IP appears in the most failed-password lines,
 * then one Accepted line, then a sudo COMMAND line naming the file where the data was staged.
 */
export function generateAuthLog(seed = 'novacorp-auth'): string {
  const rng = createRandom(seed);
  const lines: { minute: number; second: number; text: string }[] = [];
  const add = (minute: number, second: number, text: string): void => {
    lines.push({ minute, second, text: `${stamp(minute, second)} ${HOST} ${text}` });
  };

  const employees = ['jlin', 'dpatel', 'schen', 'awong', 'rgarcia', 'khaddad', 'mreyes'];
  const internalIps = ['10.20.4.15', '10.20.4.22', '10.20.5.3', '10.20.5.41', '10.20.6.9'];
  // RFC 5737 documentation ranges — safe stand-ins for "attacker" addresses.
  const noiseIps = ['198.51.100.9', '198.51.100.23', '203.0.113.12', '203.0.113.88', '192.0.2.77'];
  const invalidUsers = ['oracle', 'test', 'admin', 'postgres', 'ubuntu', 'ftpuser', 'git', 'user'];

  let minute = 1;
  const sshdPid = (): number => 1000 + rng.int(0, 8000);

  // Routine cron and systemd sessions, plus normal employee logins, spread across the day.
  for (let i = 0; i < 380; i++) {
    minute += rng.int(0, 3);
    const second = rng.int(0, 59);
    const roll = rng.next();
    if (roll < 0.28) {
      const user = rng.pick(['root', 'nova-backup']);
      add(
        minute,
        second,
        `CRON[${sshdPid()}]: pam_unix(cron:session): session opened for user ${user}(uid=0) by (uid=0)`,
      );
    } else if (roll < 0.5) {
      add(
        minute,
        second,
        `systemd-logind[911]: New session ${rng.int(100, 999)} of user ${rng.pick(employees)}.`,
      );
    } else if (roll < 0.78) {
      const user = rng.pick(employees.filter((employee) => employee !== COMPROMISED_USER));
      const ip = rng.pick(internalIps);
      add(
        minute,
        second,
        `sshd[${sshdPid()}]: Accepted publickey for ${user} from ${ip} port ${rng.int(40000, 65000)} ssh2: ED25519 SHA256:${'abcdef0123456789'.slice(0, 8)}`,
      );
    } else {
      add(
        minute,
        second,
        `sshd[${sshdPid()}]: Received disconnect from ${rng.pick(internalIps)} port ${rng.int(40000, 65000)}:11: disconnected by user`,
      );
    }
  }

  // Background brute-force noise: scattered failures against invalid users, from many IPs.
  for (let i = 0; i < 150; i++) {
    minute += rng.int(0, 2);
    const second = rng.int(0, 59);
    const ip = rng.pick(noiseIps);
    add(
      minute,
      second,
      `sshd[${sshdPid()}]: Failed password for invalid user ${rng.pick(invalidUsers)} from ${ip} port ${rng.int(30000, 60000)} ssh2`,
    );
  }

  // The real attack: a focused burst of failures against a REAL user from ONE IP, then success.
  let attackMinute = 8 * 60 + 40;
  for (let i = 0; i < 34; i++) {
    attackMinute += rng.int(0, 1);
    const second = rng.int(0, 59);
    add(
      attackMinute,
      second,
      `sshd[24771]: Failed password for ${COMPROMISED_USER} from ${ATTACKER_IP} port ${rng.int(50000, 51000)} ssh2`,
    );
  }
  attackMinute += 1;
  add(
    attackMinute,
    12,
    `sshd[24771]: Accepted password for ${COMPROMISED_USER} from ${ATTACKER_IP} port 51044 ssh2`,
  );
  add(
    attackMinute,
    12,
    `sshd[24771]: pam_unix(sshd:session): session opened for user ${COMPROMISED_USER}(uid=1007) by (uid=0)`,
  );
  add(
    attackMinute,
    44,
    `sudo:  ${COMPROMISED_USER} : TTY=pts/3 ; PWD=/home/${COMPROMISED_USER} ; USER=root ; COMMAND=/usr/bin/cp /srv/finance/q3-review.csv ${STAGED_PATH}`,
  );
  add(
    attackMinute,
    45,
    `sudo: pam_unix(sudo:session): session opened for user root(uid=0) by ${COMPROMISED_USER}(uid=1007)`,
  );

  // A little more routine traffic afterwards, so the success is not simply the last line.
  for (let i = 0; i < 40; i++) {
    minute = attackMinute + 1 + rng.int(0, 120);
    const second = rng.int(0, 59);
    add(
      minute,
      second,
      `sshd[${sshdPid()}]: Accepted publickey for ${rng.pick(employees.filter((e) => e !== COMPROMISED_USER))} from ${rng.pick(internalIps)} port ${rng.int(40000, 65000)} ssh2: ED25519 SHA256:aabbccdd`,
    );
  }

  lines.sort((a, b) => a.minute - b.minute || a.second - b.second);
  return lines.map((line) => line.text).join('\n') + '\n';
}
