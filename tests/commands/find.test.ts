import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [
    { name: 'guest', uid: 1000 },
    { name: 'admin', uid: 1001 },
  ],
  fs: {
    '/srv/app/config.yml': { content: 'x', owner: 'admin', mode: '0644' },
    '/srv/app/config.yml.bak': { content: 'password: hunter2\n', owner: 'admin', mode: '0644' },
    '/srv/app/secret.bak': { content: 'no read\n', owner: 'admin', mode: '0600' },
    '/srv/app/logs': { dir: true, owner: 'admin', mode: '0755' },
    '/srv/app/logs/app.log': { content: 'x'.repeat(5000), owner: 'admin', mode: '0644' },
    '/srv/app/logs/old.log': { content: '', owner: 'admin', mode: '0644' },
    '/srv/private': { dir: true, owner: 'admin', mode: '0700' },
    '/srv/private/hidden.bak': { content: 'x', owner: 'admin', mode: '0644' },
    '/srv/tool': { content: '\x7fELF', owner: 'root', mode: '4755' },
    '/srv/link.bak': { symlink: '/srv/app/config.yml.bak', owner: 'guest', group: 'guest' },
  },
};

const harness = () =>
  createHarness({ commands: LINUX_COMMANDS, host: HOST, user: 'guest', cwd: '/srv' });

describe('find', () => {
  it('lists everything under a starting point in sorted order', async () => {
    const h = harness();
    const out = (await h.run('find app -type f 2>/dev/null')).stdout;
    expect(out).toBe(
      'app/config.yml\napp/config.yml.bak\napp/logs/app.log\napp/logs/old.log\napp/secret.bak\n',
    );
  });

  it('matches by name and is case-insensitive with -iname', async () => {
    const h = harness();
    expect((await h.run('find app -name "*.bak"')).stdout).toBe(
      'app/config.yml.bak\napp/secret.bak\n',
    );
    expect((await h.run('find app -name "*.YML"')).stdout).toBe('');
    expect((await h.run('find app -iname "*.yml"')).stdout).toBe('app/config.yml\n');
  });

  it('filters by type, user and size', async () => {
    const h = harness();
    expect((await h.run('find app -type d')).stdout).toBe('app\napp/logs\n');
    expect((await h.run('find app -type l')).stdout).toBe('');
    expect((await h.run('find . -type l 2>/dev/null')).stdout).toBe('./link.bak\n');
    expect((await h.run('find app -user admin -type f')).stdout.split('\n').length).toBe(6);
    expect((await h.run('find app -type f -size +1k')).stdout).toBe('app/logs/app.log\n');
    expect((await h.run('find app -empty')).stdout).toBe('app/logs/old.log\n');
  });

  it('finds world-readable .bak files via a symbolic -perm test', async () => {
    const h = harness();
    const out = (await h.run('find /srv -perm -o=r -name "*.bak" 2>/dev/null')).stdout;
    expect(out).toContain('/srv/app/config.yml.bak');
    expect(out).not.toContain('/srv/app/secret.bak');
    expect(out).not.toContain('/srv/private/hidden.bak');
  });

  it('finds setuid programs with an octal -perm test', async () => {
    const h = harness();
    expect((await h.run('find /srv -perm -4000 -type f 2>/dev/null')).stdout).toBe('/srv/tool\n');
    expect((await h.run('find /srv -perm -u+s -type f 2>/dev/null')).stdout).toBe('/srv/tool\n');
  });

  it('prints permission errors to stderr, silenced by 2>/dev/null', async () => {
    const h = harness();
    const noisy = await h.run('find /srv');
    expect(noisy.stderr).toContain("find: '/srv/private': Permission denied");
    expect(noisy.status).toBe(1);
    const quiet = await h.run('find /srv 2>/dev/null');
    expect(quiet.stderr).toBe('');
  });

  it('supports operators, negation, grouping and depth limits', async () => {
    const h = harness();
    expect((await h.run('find app -name "*.yml" -o -name "*.log"')).stdout).toBe(
      'app/config.yml\napp/logs/app.log\napp/logs/old.log\n',
    );
    expect((await h.run('find app -type f ! -name "*.bak"')).stdout).toBe(
      'app/config.yml\napp/logs/app.log\napp/logs/old.log\n',
    );
    expect((await h.run('find app -maxdepth 1 -name "*.log"')).stdout).toBe('');
    expect((await h.run('find app -mindepth 1 -type d')).stdout).toBe('app/logs\n');
    expect((await h.run('find app \\( -name "*.yml" -o -name "*.bak" \\) -type f')).stdout).toBe(
      'app/config.yml\napp/config.yml.bak\napp/secret.bak\n',
    );
  });

  it('reports errors for bad predicates and missing paths', async () => {
    const h = harness();
    expect(await h.run('find /nonexistent 2>&1')).toMatchObject({
      status: 1,
      stdout: "find: '/nonexistent': No such file or directory\n",
    });
    expect((await h.run('find app -bogus')).stderr).toBe("find: unknown predicate `-bogus'\n");
    expect((await h.run('find app -type x')).stderr).toBe('find: Unknown argument to -type: x\n');
    expect((await h.run('find app -name')).stderr).toBe("find: missing argument to `-name'\n");
    expect((await h.run('find app -perm zzz')).stderr).toContain('invalid mode');
  });
});
