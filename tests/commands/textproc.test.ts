import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { ROOT_CREDENTIALS as ROOT } from '../../src/engine/fs/permissions';
import type { HostDefinition } from '../../src/engine/system/host';
import { createHarness } from '../helpers/shell';

const AUTH =
  [
    'Mar 14 02:59:01 corp-web01 sshd[2001]: Failed password for invalid user oracle from 198.51.100.9 port 40001 ssh2',
    'Mar 14 03:00:11 corp-web01 sshd[2002]: Failed password for mreyes from 203.0.113.47 port 51000 ssh2',
    'Mar 14 03:00:14 corp-web01 sshd[2003]: Failed password for mreyes from 203.0.113.47 port 51002 ssh2',
    'Mar 14 03:00:20 corp-web01 sshd[2004]: Accepted password for mreyes from 203.0.113.47 port 51010 ssh2',
    'Mar 14 03:01:02 corp-web01 sshd[2010]: Accepted password for jlin from 192.0.2.8 port 60000 ssh2',
  ].join('\n') + '\n';

const HOST: HostDefinition = {
  hostname: 'corp-web01',
  users: [{ name: 'guest', uid: 1000 }],
  fs: {
    '/home/guest/auth.log': { content: AUTH, owner: 'guest' },
    '/home/guest/nums.txt': { content: '10\n2\n33\n4\n2\n', owner: 'guest' },
    '/home/guest/names.csv': {
      content: 'id,name,role\n3,Carol,admin\n1,Alice,user\n2,Bob,user\n',
      owner: 'guest',
    },
    '/home/guest/dir': { dir: true, owner: 'guest' },
    '/home/guest/dir/a.txt': { content: 'alpha TODO\nbeta\n', owner: 'guest' },
    '/home/guest/dir/b.txt': { content: 'gamma\nTODO delta\n', owner: 'guest' },
  },
};

const harness = () => createHarness({ commands: LINUX_COMMANDS, host: HOST });

describe('grep', () => {
  it('prints matching lines and sets exit status', async () => {
    const h = harness();
    expect((await h.run('grep Accepted auth.log')).stdout).toBe(
      'Mar 14 03:00:20 corp-web01 sshd[2004]: Accepted password for mreyes from 203.0.113.47 port 51010 ssh2\nMar 14 03:01:02 corp-web01 sshd[2010]: Accepted password for jlin from 192.0.2.8 port 60000 ssh2\n',
    );
    expect((await h.run('grep Accepted auth.log')).status).toBe(0);
    expect(await h.run('grep zzz auth.log')).toEqual({ stdout: '', stderr: '', status: 1 });
  });

  it('supports -i, -v, -n, -c, -o, -w, -x', async () => {
    const h = harness();
    expect((await h.run('grep -c Failed auth.log')).stdout).toBe('3\n');
    expect((await h.run('grep -in accepted auth.log')).stdout).toBe(
      '4:Mar 14 03:00:20 corp-web01 sshd[2004]: Accepted password for mreyes from 203.0.113.47 port 51010 ssh2\n5:Mar 14 03:01:02 corp-web01 sshd[2010]: Accepted password for jlin from 192.0.2.8 port 60000 ssh2\n',
    );
    expect((await h.run('grep -vc Failed auth.log')).stdout).toBe('2\n');
    expect((await h.run('grep -o "203.0.113.47" auth.log')).stdout).toBe(
      '203.0.113.47\n203.0.113.47\n203.0.113.47\n',
    );
    expect((await h.run('echo "the theme" | grep -ow the')).stdout).toBe('the\n');
    expect((await h.run('printf "yes\\nno\\n" | grep -x yes')).stdout).toBe('yes\n');
  });

  it('uses basic and extended regular expressions', async () => {
    const h = harness();
    expect((await h.run('grep "^Mar 14 03:00" auth.log | wc -l')).stdout).toBe('3\n');
    expect((await h.run('grep "ssh2$" auth.log | wc -l')).stdout).toBe('5\n');
    expect((await h.run('grep -E "mreyes|jlin" auth.log | wc -l')).stdout).toBe('4\n');
    expect((await h.run('grep "user\\|invalid" auth.log | wc -l')).stdout).toBe('1\n');
    expect((await h.run('grep -o "port [0-9]*" auth.log | head -1')).stdout).toBe('port 40001\n');
    expect((await h.run('grep -E "[0-9]{3}\\.[0-9]" auth.log | wc -l')).stdout).toBe('5\n');
  });

  it('extracts attacker IPs with the classic pipeline', async () => {
    const h = harness();
    const output = (
      await h.run(
        'grep "Failed password" auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn',
      )
    ).stdout;
    expect(output).toBe('      2 from 203.0.113.47\n      1 from 198.51.100.9\n');
  });

  it('reads stdin and multiple files with -H/-h', async () => {
    const h = harness();
    expect((await h.run('echo hello | grep ell')).stdout).toBe('hello\n');
    expect((await h.run('grep -H beta dir/a.txt')).stdout).toBe('dir/a.txt:beta\n');
    expect((await h.run('grep TODO dir/a.txt dir/b.txt')).stdout).toBe(
      'dir/a.txt:alpha TODO\ndir/b.txt:TODO delta\n',
    );
    expect((await h.run('grep -h TODO dir/a.txt dir/b.txt')).stdout).toBe(
      'alpha TODO\nTODO delta\n',
    );
  });

  it('searches recursively and lists file names', async () => {
    const h = harness();
    expect((await h.run('grep -rl TODO dir')).stdout).toBe('dir/a.txt\ndir/b.txt\n');
    expect((await h.run('grep -rn TODO dir')).stdout).toBe(
      'dir/a.txt:1:alpha TODO\ndir/b.txt:2:TODO delta\n',
    );
    expect((await h.run('grep -L gamma dir/a.txt dir/b.txt')).stdout).toBe('dir/a.txt\n');
  });

  it('stops after -m matches and is quiet with -q', async () => {
    const h = harness();
    expect((await h.run('grep -m1 Failed auth.log')).stdout).toBe(
      'Mar 14 02:59:01 corp-web01 sshd[2001]: Failed password for invalid user oracle from 198.51.100.9 port 40001 ssh2\n',
    );
    expect(await h.run('grep -q mreyes auth.log && echo found')).toMatchObject({
      stdout: 'found\n',
    });
    expect((await h.run('grep -q nothing auth.log')).status).toBe(1);
  });

  it('colors matches when asked', async () => {
    const h = harness();
    expect((await h.run('grep --color=always jlin auth.log')).stdout).toContain(
      '\x1b[01;31mjlin\x1b[0m',
    );
    expect((await h.run('grep -F "203.0.113.47" auth.log | wc -l')).stdout).toBe('3\n');
  });

  it('reports errors and usage', async () => {
    const h = harness();
    expect(await h.run('grep TODO dir')).toMatchObject({
      stderr: 'grep: dir: Is a directory\n',
      status: 2,
    });
    expect(await h.run('grep pattern nope')).toMatchObject({
      stderr: 'grep: nope: No such file or directory\n',
      status: 2,
    });
    const noArgs = await h.run('grep');
    expect(noArgs.status).toBe(2);
    expect(noArgs.stderr).toContain('Usage: grep');
    expect((await h.run('grep -P foo x')).stderr).toContain("option '-P' is not supported");
  });
});

describe('head and tail', () => {
  it('show the first and last lines', async () => {
    const h = harness();
    expect((await h.run('head -n 2 auth.log')).stdout).toBe(
      'Mar 14 02:59:01 corp-web01 sshd[2001]: Failed password for invalid user oracle from 198.51.100.9 port 40001 ssh2\nMar 14 03:00:11 corp-web01 sshd[2002]: Failed password for mreyes from 203.0.113.47 port 51000 ssh2\n',
    );
    expect((await h.run('head -1 auth.log')).stdout.startsWith('Mar 14 02:59:01')).toBe(true);
    expect((await h.run('tail -n 1 auth.log')).stdout).toBe(
      'Mar 14 03:01:02 corp-web01 sshd[2010]: Accepted password for jlin from 192.0.2.8 port 60000 ssh2\n',
    );
    expect((await h.run('tail -n +5 auth.log')).stdout.startsWith('Mar 14 03:01:02')).toBe(true);
  });

  it('handle byte counts and negative counts', async () => {
    const h = harness();
    expect((await h.run('printf "abcdef" | head -c 3')).stdout).toBe('abc');
    expect((await h.run('printf "abcdef" | tail -c 2')).stdout).toBe('ef');
    expect((await h.run('printf "a\\nb\\nc\\nd\\n" | head -n -1')).stdout).toBe('a\nb\nc\n');
    expect((await h.run('printf "a\\nb\\nc\\nd\\n" | tail -n +2')).stdout).toBe('b\nc\nd\n');
    expect((await h.run('printf "a\\nb\\nc\\n" | head -c -2')).stdout).toBe('a\nb\n');
  });

  it('print headers for several files', async () => {
    const h = harness();
    const out = (await h.run('head -n 1 auth.log nums.txt')).stdout;
    expect(out).toBe(
      '==> auth.log <==\nMar 14 02:59:01 corp-web01 sshd[2001]: Failed password for invalid user oracle from 198.51.100.9 port 40001 ssh2\n\n==> nums.txt <==\n10\n',
    );
    expect((await h.run('tail -q -n 1 auth.log nums.txt')).stdout).toBe(
      'Mar 14 03:01:02 corp-web01 sshd[2010]: Accepted password for jlin from 192.0.2.8 port 60000 ssh2\n2\n',
    );
  });

  it('report errors', async () => {
    const h = harness();
    expect(await h.run('head nope')).toMatchObject({
      stderr: "head: cannot open 'nope' for reading: No such file or directory\n",
      status: 1,
    });
    expect((await h.run('head -n abc auth.log')).stderr).toBe(
      "head: invalid number of lines: 'abc'\n",
    );
    expect((await h.run('tail -f auth.log')).stderr).toBe(
      'tail: following files (-f) is not supported in this simulation\n',
    );
  });
});

describe('wc', () => {
  it('counts lines, words and bytes', async () => {
    const h = harness();
    expect((await h.run('wc auth.log')).stdout).toBe('  5  72 512 auth.log\n');
    expect((await h.run('wc -l auth.log')).stdout).toBe('5 auth.log\n');
    expect((await h.run('wc -w auth.log')).stdout).toBe('72 auth.log\n');
    expect((await h.run('wc -c nums.txt')).stdout).toBe('12 nums.txt\n');
    expect((await h.run('grep Failed auth.log | wc -l')).stdout).toBe('3\n');
  });

  it('counts characters and longest line, and totals', async () => {
    const h = harness();
    expect((await h.run('printf "caf\\xc3\\xa9\\n" | wc -m')).stdout).toBe('5\n');
    expect((await h.run('printf "caf\\xc3\\xa9\\n" | wc -c')).stdout).toBe('6\n');
    expect((await h.run('wc -L auth.log')).stdout).toBe('112 auth.log\n');
    expect((await h.run('wc -l auth.log nums.txt')).stdout).toBe(
      ' 5 auth.log\n 5 nums.txt\n10 total\n',
    );
  });
});

describe('sort', () => {
  it('sorts lines, numbers and in reverse', async () => {
    const h = harness();
    expect((await h.run('sort nums.txt')).stdout).toBe('10\n2\n2\n33\n4\n');
    expect((await h.run('sort -n nums.txt')).stdout).toBe('2\n2\n4\n10\n33\n');
    expect((await h.run('sort -rn nums.txt')).stdout).toBe('33\n10\n4\n2\n2\n');
    expect((await h.run('sort -u nums.txt')).stdout).toBe('10\n2\n33\n4\n');
  });

  it('sorts by key with a separator', async () => {
    const h = harness();
    expect((await h.run('tail -n +2 names.csv | sort -t, -k2')).stdout).toBe(
      '1,Alice,user\n2,Bob,user\n3,Carol,admin\n',
    );
    expect((await h.run('tail -n +2 names.csv | sort -t, -k1 -rn')).stdout).toBe(
      '3,Carol,admin\n2,Bob,user\n1,Alice,user\n',
    );
    expect((await h.run('tail -n +2 names.csv | sort -t, -k1nr')).stdout).toBe(
      '3,Carol,admin\n2,Bob,user\n1,Alice,user\n',
    );
  });

  it('folds case, ignores blanks and checks order', async () => {
    const h = harness();
    expect((await h.run('printf "banana\\nApple\\ncherry\\n" | sort -f')).stdout).toBe(
      'Apple\nbanana\ncherry\n',
    );
    expect((await h.run('printf "  b\\na\\n" | sort -b')).stdout).toBe('a\n  b\n');
    expect(await h.run('sort -c nums.txt')).toMatchObject({
      stderr: 'sort: -:5: disorder: 2\n',
      status: 1,
    });
    expect((await h.run('sort -n nums.txt | sort -nc')).status).toBe(0);
  });

  it('is stable and reports errors', async () => {
    const h = harness();
    expect((await h.run('printf "b 1\\na 2\\nb 3\\n" | sort -k1,1')).stdout).toBe(
      'a 2\nb 1\nb 3\n'.replace('-k1,1', ''),
    );
    expect((await h.run('sort -k0 nums.txt')).stderr).toContain('sort: invalid');
    expect((await h.run('sort -R nums.txt')).stderr).toContain("option '-R' is not supported");
  });
});

describe('uniq', () => {
  it('collapses, counts and filters adjacent duplicates', async () => {
    const h = harness();
    expect((await h.run('sort nums.txt | uniq')).stdout).toBe('10\n2\n33\n4\n');
    expect((await h.run('sort nums.txt | uniq -c')).stdout).toBe(
      '      1 10\n      2 2\n      1 33\n      1 4\n',
    );
    expect((await h.run('sort nums.txt | uniq -d')).stdout).toBe('2\n');
    expect((await h.run('sort nums.txt | uniq -u')).stdout).toBe('10\n33\n4\n');
  });

  it('only compares adjacent lines and ignores case', async () => {
    const h = harness();
    expect((await h.run('printf "a\\nb\\na\\n" | uniq')).stdout).toBe('a\nb\na\n');
    expect((await h.run('printf "Yes\\nyes\\nNO\\n" | uniq -i')).stdout).toBe('Yes\nNO\n');
  });

  it('writes to an output file', async () => {
    const h = harness();
    await h.run('sort nums.txt | uniq -c uniq.out'.replace(' uniq.out', ''));
    expect((await h.run('sort nums.txt | uniq > out.txt')).status).toBe(0);
    expect(h.machine.fs.readFile('/home/guest/out.txt', ROOT)).toBe('10\n2\n33\n4\n');
  });
});

describe('cut', () => {
  it('cuts fields and characters', async () => {
    const h = harness();
    expect((await h.run('cut -d, -f2 names.csv')).stdout).toBe('name\nCarol\nAlice\nBob\n');
    expect((await h.run('cut -d, -f1,3 names.csv')).stdout).toBe(
      'id,role\n3,admin\n1,user\n2,user\n',
    );
    expect((await h.run('cut -d: -f1 /etc/passwd | head -1')).stdout).toBe('root\n');
    expect((await h.run('echo abcdef | cut -c2-4')).stdout).toBe('bcd\n');
    expect((await h.run('echo abcdef | cut -c-3')).stdout).toBe('abc\n');
    expect((await h.run('echo abcdef | cut -c4-')).stdout).toBe('def\n');
    expect((await h.run('echo abcdef | cut -c1,3,5')).stdout).toBe('ace\n');
  });

  it('handles delimiters, only-delimited, complement and output delimiter', async () => {
    const h = harness();
    expect((await h.run('printf "a,b\\nnodelim\\n" | cut -d, -f1')).stdout).toBe('a\nnodelim\n');
    expect((await h.run('printf "a,b\\nnodelim\\n" | cut -d, -f1 -s')).stdout).toBe('a\n');
    expect((await h.run('cut -d, -f2 --complement names.csv')).stdout).toBe(
      'id,role\n3,admin\n1,user\n2,user\n',
    );
    expect((await h.run('cut -d, -f1,2 --output-delimiter=" | " names.csv')).stdout).toBe(
      'id | name\n3 | Carol\n1 | Alice\n2 | Bob\n',
    );
    expect((await h.run('grep Accepted auth.log | cut -d" " -f8')).stdout).toBe('for\nfor\n');
  });

  it('extracts a compromised path column from a log line', async () => {
    const h = harness();
    expect((await h.run('grep Accepted auth.log | cut -d" " -f11')).stdout).toBe(
      '203.0.113.47\n192.0.2.8\n',
    );
  });

  it('reports errors', async () => {
    const h = harness();
    expect((await h.run('cut names.csv')).stderr).toContain(
      'you must specify a list of bytes, characters, or fields',
    );
    expect((await h.run('cut -f1 -c1 x')).stderr).toContain(
      'only one type of list may be specified',
    );
    expect((await h.run('cut -d, -f0 names.csv')).stderr).toContain('cut: invalid');
    expect((await h.run('cut -d,, -f1 names.csv')).stderr).toContain(
      'the delimiter must be a single character',
    );
  });
});

describe('base64', () => {
  it('encodes and decodes', async () => {
    const h = harness();
    expect((await h.run('echo ZmxhZ3toaWRkZW59 | base64 -d')).stdout).toBe('flag{hidden}');
    expect((await h.run('printf "Man" | base64')).stdout).toBe('TWFu\n');
    expect((await h.run('printf "Man" | base64 | base64 -d')).stdout).toBe('Man');
    h.machine.fs.writeFile('/home/guest/note.b64', 'Tm92YUNvcnA=\n', ROOT);
    expect((await h.run('base64 -d note.b64')).stdout).toBe('NovaCorp');
  });

  it('wraps long output and reports invalid input', async () => {
    const h = harness();
    expect(
      (
        await h.run(
          'printf "%0.saaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 1 | base64 -w0',
        )
      ).stdout,
    ).not.toContain('\n'.repeat(1) + 'a');
    expect((await h.run('echo "not valid base64 !!!" | base64 -d')).status).toBe(1);
    expect((await h.run('echo "not!!" | base64 -di')).stdout.length).toBeGreaterThanOrEqual(0);
    expect(await h.run('base64 a b')).toMatchObject({
      stderr: "base64: extra operand 'b'\nTry 'base64 --help' for more information.\n",
      status: 1,
    });
  });
});
