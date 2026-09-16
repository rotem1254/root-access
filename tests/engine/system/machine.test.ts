import { describe, expect, it } from 'vitest';
import { DefinitionError, applyFsDefinition } from '../../../src/engine/fs/definition';
import { fakeElf } from '../../../src/engine/fs/baseSystem';
import { ROOT_CREDENTIALS as ROOT } from '../../../src/engine/fs/permissions';
import { buildMachine, buildUserDB } from '../../../src/engine/system/Machine';
import {
  findSudoPermission,
  formatSudoRule,
  rulesFor,
  sudoersFile,
} from '../../../src/engine/system/sudoers';
import { UserDB } from '../../../src/engine/system/UserDB';
import { ManualClock } from '../../../src/engine/util/clock';
import { sealBytes } from '../../../src/engine/util/seal';

const TIME = Date.parse('2026-03-14T09:00:00Z');

const host = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000, password: 'guest123' },
    { name: 'analyst', uid: 1001, groups: ['adm'] },
    { name: 'root', uid: 0, password: 'toor' },
  ],
  groups: [{ name: 'finance', gid: 1500, members: ['analyst'] }],
  sudoers: [{ who: 'guest', commands: ['/usr/bin/find'], nopasswd: true }],
  fs: {
    '/home/guest/notes.txt': { content: 'hello\n', owner: 'guest' },
    '/home/guest/.secret': { content: sealBytes('FLAG{x}'), mode: '0600', owner: 'guest' },
    '/var/log/auth.log': { content: 'log', mode: '0640', group: 'adm' },
    '/home/analyst': { dir: true, mode: '0711', owner: 'analyst' },
    '/opt/tool': { binary: 'AAEC', mode: '0755' },
    '/opt/link': { symlink: '/opt/tool' },
    '/srv/finance/q3.csv': {
      content: 'x',
      group: 'finance',
      mode: '0640',
      mtime: '2026-01-02T03:04:05Z',
    },
  },
  motd: 'NovaCorp internal server.\n',
} as const;

function build() {
  return buildMachine(host, {
    clock: new ManualClock(TIME),
    time: TIME,
    binaries: [
      { name: 'ls', description: 'list directory contents' },
      { name: 'su', description: 'run a command with substitute user', setuid: true },
    ],
  });
}

describe('UserDB', () => {
  const db = buildUserDB(host);

  it('merges base accounts with level accounts', () => {
    expect(db.byName('root')?.uid).toBe(0);
    expect(db.byName('guest')).toMatchObject({
      uid: 1000,
      gid: 1000,
      home: '/home/guest',
      shell: '/bin/bash',
      gecos: 'guest,,,',
    });
    expect(db.byUid(1001)?.name).toBe('analyst');
    expect(db.groupByName('guest')?.gid).toBe(1000);
    expect(db.groupByGid(4)?.name).toBe('adm');
  });

  it('computes credentials with supplementary groups', () => {
    const analyst = db.byName('analyst');
    expect(analyst).toBeDefined();
    expect(db.credentials(analyst!)).toEqual({ uid: 1001, gid: 1001, groups: [1001, 4, 1500] });
    expect(db.supplementaryGroups(analyst!).map((g) => g.name)).toEqual(['adm', 'finance']);
  });

  it('checks passwords and locks accounts without one', () => {
    expect(db.checkPassword('guest', 'guest123')).toBe(true);
    expect(db.checkPassword('guest', 'wrong')).toBe(false);
    expect(db.checkPassword('analyst', '')).toBe(false);
    expect(db.isLocked('analyst')).toBe(true);
    expect(db.checkPassword('root', 'toor')).toBe(true);
    expect(db.checkPassword('nobody-here', 'x')).toBe(false);
  });

  it('labels unknown ids with numbers', () => {
    expect(db.userLabel(1000)).toBe('guest');
    expect(db.userLabel(4242)).toBe('4242');
    expect(db.groupLabel(4)).toBe('adm');
    expect(db.groupLabel(4242)).toBe('4242');
  });

  it('renders passwd, group and shadow files', () => {
    expect(db.passwdFile()).toContain('root:x:0:0:root:/root:/bin/bash\n');
    expect(db.passwdFile()).toContain('guest:x:1000:1000:guest,,,:/home/guest:/bin/bash\n');
    expect(db.groupFile()).toContain('adm:x:4:syslog,analyst\n');
    const shadow = db.shadowFile();
    expect(shadow).toMatch(
      /^guest:\$y\$j9T\$[./0-9A-Za-z]{22}\$[./0-9A-Za-z]{43}:20526:0:99999:7:::$/m,
    );
    expect(shadow).toContain('analyst:*:20526:0:99999:7:::\n');
    expect(shadow).not.toContain('guest123');
  });

  it('rejects duplicates and unknown groups', () => {
    const fresh = new UserDB([], [{ name: 'g', gid: 1, members: [] }]);
    expect(() => fresh.addGroup({ name: 'g', gid: 2, members: [] })).toThrow('duplicate group');
    fresh.addUser({
      name: 'u',
      uid: 1,
      gid: 1,
      gecos: '',
      home: '/',
      shell: '/bin/sh',
      password: null,
    });
    expect(() =>
      fresh.addUser({ name: 'u', uid: 2, gid: 1, gecos: '', home: '/', shell: '', password: null }),
    ).toThrow('duplicate user');
    expect(() => fresh.addMember('nope', 'u')).toThrow('unknown group');
    expect(() => fresh.setPassword('nope', 'x')).toThrow('unknown user');
    fresh.addMember('g', 'u');
    fresh.addMember('g', 'u');
    expect(fresh.groupByName('g')?.members).toEqual(['u']);
    expect(fresh.allGroups()).toHaveLength(1);
  });

  it('reuses an existing group named after a new user', () => {
    const db2 = buildUserDB({
      hostname: 'h',
      groups: [{ name: 'ops', gid: 3000 }],
      users: [{ name: 'ops', uid: 1200 }],
    });
    expect(db2.byName('ops')?.gid).toBe(3000);
    const db3 = buildUserDB({
      hostname: 'h',
      users: [
        { name: 'svc', uid: 1300, gid: 100, home: '/srv/svc', shell: '/bin/sh', gecos: 'Service' },
      ],
    });
    expect(db3.byName('svc')).toMatchObject({
      gid: 100,
      home: '/srv/svc',
      shell: '/bin/sh',
      gecos: 'Service',
    });
  });
});

describe('sudoers', () => {
  const rules = [
    { who: 'root', runAs: 'ALL', commands: 'ALL' as const },
    { who: '%sudo', runAs: 'ALL', commands: 'ALL' as const },
    { who: 'guest', commands: ['/usr/bin/find'], nopasswd: true },
    {
      who: 'guest',
      runAs: 'backup',
      commands: ['/usr/bin/tar czf /var/backups/*', '/usr/bin/id ""'],
    },
  ];

  it('selects rules by user and group', () => {
    expect(rulesFor(rules, 'guest', ['guest'])).toHaveLength(2);
    expect(rulesFor(rules, 'dev', ['dev', 'sudo'])).toHaveLength(1);
  });

  it('matches commands, arguments and targets', () => {
    expect(
      findSudoPermission(rules, 'guest', [], 'root', '/usr/bin/find', ['.', '-name', 'x']),
    ).toBeDefined();
    expect(
      findSudoPermission(rules, 'guest', [], 'root', '/usr/bin/cat', ['/etc/shadow']),
    ).toBeUndefined();
    expect(
      findSudoPermission(rules, 'guest', [], 'backup', '/usr/bin/tar', [
        'czf',
        '/var/backups/a.tgz',
      ]),
    ).toBeDefined();
    expect(
      findSudoPermission(rules, 'guest', [], 'backup', '/usr/bin/tar', [
        'xzf',
        '/var/backups/a.tgz',
      ]),
    ).toBeUndefined();
    expect(
      findSudoPermission(rules, 'guest', [], 'root', '/usr/bin/tar', ['czf', '/var/backups/a']),
    ).toBeUndefined();
    expect(findSudoPermission(rules, 'guest', [], 'backup', '/usr/bin/id', [])).toBeDefined();
    expect(findSudoPermission(rules, 'guest', [], 'backup', '/usr/bin/id', ['-u'])).toBeUndefined();
    expect(
      findSudoPermission(rules, 'dev', ['sudo'], 'www-data', '/usr/bin/anything', []),
    ).toBeDefined();
  });

  it('formats rules for sudo -l and /etc/sudoers', () => {
    expect(formatSudoRule(rules[2]!)).toBe('(root) NOPASSWD: /usr/bin/find');
    expect(formatSudoRule(rules[1]!)).toBe('(ALL : ALL) ALL');
    expect(formatSudoRule(rules[3]!)).toBe(
      '(backup) /usr/bin/tar czf /var/backups/*, /usr/bin/id ""',
    );
    const file = sudoersFile(rules);
    expect(file).toContain('%sudo\tALL=(ALL:ALL) ALL');
    expect(file).toContain('guest\tALL=(root) NOPASSWD: /usr/bin/find');
    expect(file).toContain('Defaults\tsecure_path=');
  });
});

describe('buildMachine', () => {
  it('lays out an Ubuntu-like base system', () => {
    const m = build();
    const fs = m.fs;
    expect(m.hostname).toBe('corp-web01');
    expect(fs.readlink('/bin', ROOT)).toBe('usr/bin');
    expect(fs.stat('/tmp', ROOT).mode).toBe(0o1777);
    expect(fs.stat('/root', ROOT).mode).toBe(0o700);
    expect(fs.stat('/var/log', ROOT)).toMatchObject({ mode: 0o775, gid: 111 });
    expect(fs.readFile('/etc/hostname', ROOT)).toBe('corp-web01\n');
    expect(fs.readFile('/etc/motd', ROOT)).toBe('NovaCorp internal server.\n');
    expect(fs.stat('/etc/shadow', ROOT)).toMatchObject({ mode: 0o640, gid: 42 });
    expect(fs.stat('/etc/sudoers', ROOT).mode).toBe(0o440);
    expect(fs.readFile('/etc/passwd', ROOT)).toContain('analyst:x:1001');
    expect(fs.stat('/dev/null', ROOT)).toMatchObject({ device: 'null', mode: 0o666 });
  });

  it('installs registered commands as executables, setuid where needed', () => {
    const fs = build().fs;
    expect(fs.stat('/usr/bin/ls', ROOT)).toMatchObject({ exec: 'ls', mode: 0o755 });
    expect(fs.stat('/bin/su', ROOT)).toMatchObject({ exec: 'su', mode: 0o4755 });
    expect(fs.readFile('/usr/bin/ls', ROOT).startsWith('\x7fELF')).toBe(true);
    expect(fakeElf('ls', 'list directory contents')).toContain('list directory contents');
  });

  it('creates homes with skeleton files for regular users', () => {
    const fs = build().fs;
    expect(fs.stat('/home/guest', ROOT)).toMatchObject({ uid: 1000, gid: 1000, mode: 0o750 });
    expect(fs.readdir('/home/guest', ROOT).sort()).toEqual([
      '.bash_logout',
      '.bashrc',
      '.profile',
      '.secret',
      'notes.txt',
    ]);
    expect(fs.readFile('/home/guest/.bashrc', ROOT)).toContain('HISTCONTROL=ignoreboth');
  });

  it('applies level files over the base system', () => {
    const fs = build().fs;
    expect(fs.readFile('/home/guest/.secret', ROOT)).toBe('FLAG{x}');
    expect(fs.stat('/home/guest/.secret', ROOT)).toMatchObject({
      uid: 1000,
      gid: 1000,
      mode: 0o600,
    });
    expect(fs.stat('/home/analyst', ROOT)).toMatchObject({ mode: 0o711, uid: 1001 });
    expect(fs.readdir('/home/analyst', ROOT)).toContain('.bashrc');
    expect(fs.stat('/var/log/auth.log', ROOT)).toMatchObject({ gid: 4, mode: 0o640, mtime: TIME });
    expect(fs.readFile('/opt/tool', ROOT)).toBe('\x00\x01\x02');
    expect(fs.readlink('/opt/link', ROOT)).toBe('/opt/tool');
    expect(fs.stat('/srv/finance', ROOT)).toMatchObject({ uid: 0, mode: 0o755 });
    expect(fs.stat('/srv/finance/q3.csv', ROOT)).toMatchObject({
      gid: 1500,
      mtime: Date.parse('2026-01-02T03:04:05Z'),
    });
  });

  it('keeps a base account when a level redefines it, updating its password', () => {
    expect(build().users.checkPassword('root', 'toor')).toBe(true);
  });
});

describe('applyFsDefinition errors', () => {
  const users = buildUserDB({ hostname: 'h' });
  const apply = (def: Record<string, unknown>): void => {
    const vfsRoot = {
      type: 'dir' as const,
      uid: 0,
      gid: 0,
      mode: 0o755,
      mtime: 0,
      children: new Map(),
    };
    applyFsDefinition(vfsRoot, def as never, users, 0);
  };

  it.each([
    [{ 'relative/path': { content: '' } }, 'paths must be absolute'],
    [{ '/a/../b': { content: '' } }, 'paths must be absolute'],
    [{ '/': { dir: true } }, 'paths must be absolute'],
    [{ '/x': { content: '', owner: 'ghost' } }, "unknown owner 'ghost'"],
    [{ '/x': { content: '', group: 'ghosts' } }, "unknown group 'ghosts'"],
    [{ '/x': { content: '', mode: '999' } }, "invalid mode '999'"],
    [{ '/x': { content: '', mtime: 'yesterday' } }, "invalid mtime 'yesterday'"],
    [{ '/x': { binary: '!!' } }, 'invalid base64'],
    [{ '/f': { content: '' }, '/f/child': { content: '' } }, "parent 'f' is not a directory"],
  ])('rejects %j', (def, message) => {
    expect(() => apply(def)).toThrow(DefinitionError);
    expect(() => apply(def)).toThrow(message);
  });
});
