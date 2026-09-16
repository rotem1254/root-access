import type { Credentials } from '../../src/engine/fs/permissions';
import { ROOT_CREDENTIALS } from '../../src/engine/fs/permissions';
import { VirtualFS } from '../../src/engine/fs/VirtualFS';
import { ManualClock } from '../../src/engine/util/clock';

export const T0 = Date.parse('2026-03-14T09:00:00Z');
export const ROOT = ROOT_CREDENTIALS;
export const ALICE: Credentials = { uid: 1000, gid: 1000, groups: [1000] };
export const BOB: Credentials = { uid: 1001, gid: 1001, groups: [1001, 4] };

interface NodeSpec {
  uid?: number;
  gid?: number;
  mode?: number;
}

/** A small tree built as root, with helpers to create owned files and directories. */
export function makeVfs(): {
  vfs: VirtualFS;
  clock: ManualClock;
  dir: (path: string, spec?: NodeSpec) => void;
  file: (path: string, data: string, spec?: NodeSpec) => void;
} {
  const clock = new ManualClock(T0);
  const vfs = new VirtualFS(clock);
  const apply = (path: string, spec: NodeSpec, defaultMode: number): void => {
    vfs.chown(path, spec.uid ?? 0, spec.gid ?? 0, ROOT, false);
    vfs.chmod(path, spec.mode ?? defaultMode, ROOT);
  };
  return {
    vfs,
    clock,
    dir: (path, spec = {}) => {
      vfs.mkdir(path, ROOT);
      apply(path, spec, 0o755);
    },
    file: (path, data, spec = {}) => {
      vfs.writeFile(path, data, ROOT);
      apply(path, spec, 0o644);
    },
  };
}
