import { describe, expect, it } from 'vitest';
import { LINUX_COMMANDS } from '../../src/engine/commands';
import { createHarness } from '../helpers/shell';

const harness = () => createHarness({ commands: LINUX_COMMANDS });

describe('printf', () => {
  it('prints strings and interprets escapes in the format', async () => {
    const h = harness();
    expect((await h.run('printf "hello\\n"')).stdout).toBe('hello\n');
    expect((await h.run('printf "%s\\n" world')).stdout).toBe('world\n');
    expect((await h.run('printf "a\\tb\\n"')).stdout).toBe('a\tb\n');
    expect((await h.run('printf "no newline"')).stdout).toBe('no newline');
    expect((await h.run('printf "\\x41\\x42\\n"')).stdout).toBe('AB\n');
    expect((await h.run('printf "\\101\\102"')).stdout).toBe('AB');
  });

  it('reuses the format string for extra arguments', async () => {
    const h = harness();
    expect((await h.run('printf "%s\\n" a b c')).stdout).toBe('a\nb\nc\n');
    expect((await h.run('printf "%s=%s " k1 v1 k2 v2')).stdout).toBe('k1=v1 k2=v2 ');
  });

  it('formats integers, hex and characters with flags and width', async () => {
    const h = harness();
    expect((await h.run('printf "%d\\n" 42')).stdout).toBe('42\n');
    expect((await h.run('printf "%5d\\n" 42')).stdout).toBe('   42\n');
    expect((await h.run('printf "%-5d|\\n" 42')).stdout).toBe('42   |\n');
    expect((await h.run('printf "%05d\\n" 42')).stdout).toBe('00042\n');
    expect((await h.run('printf "%+d\\n" 42')).stdout).toBe('+42\n');
    expect((await h.run('printf "%x\\n" 255')).stdout).toBe('ff\n');
    expect((await h.run('printf "%#X\\n" 255')).stdout).toBe('0XFF\n');
    expect((await h.run('printf "%o\\n" 8')).stdout).toBe('10\n');
    expect((await h.run('printf "%c%c\\n" hi yo')).stdout).toBe('hy\n');
    expect((await h.run('printf "%.3s\\n" abcdef')).stdout).toBe('abc\n');
    expect((await h.run('printf "%%\\n"')).stdout).toBe('%\n');
  });

  it('treats missing arguments as empty or zero', async () => {
    const h = harness();
    expect((await h.run('printf "[%s][%d]\\n"')).stdout).toBe('[][0]\n');
    expect((await h.run("printf '%d\\n' \\'A")).stdout).toBe('65\n');
  });

  it('reports invalid numbers and conversions', async () => {
    const h = harness();
    expect((await h.run('printf "%d\\n" abc')).stderr).toContain('expected a numeric value');
    expect((await h.run('printf "x\\cy"')).stdout).toBe('x');
    expect((await h.run('printf')).status).toBe(2);
  });
});
