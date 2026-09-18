import { describe, expect, it } from 'vitest';
import { NULL_GAME } from '../../../src/engine/game/api';
import {
  emptySave,
  KeyValueStorage,
  type KeyValueStore,
  MemoryStorage,
  type SaveData,
} from '../../../src/engine/game/storage';

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

const SAVE: SaveData = emptySave('01-intro');

describe('MemoryStorage', () => {
  it('stores an isolated copy', async () => {
    const storage = new MemoryStorage();
    expect(await storage.load()).toBeNull();
    await storage.save(SAVE);
    const loaded = await storage.load();
    expect(loaded).toEqual(SAVE);
    loaded!.currentLevelId = 'mutated';
    expect((await storage.load())?.currentLevelId).toBe('01-intro');
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });
});

describe('KeyValueStorage', () => {
  it('persists, reloads and clears through a key-value store', async () => {
    const store = memoryStore();
    const storage = new KeyValueStorage(store);
    await storage.save(SAVE);
    expect((await storage.load())?.currentLevelId).toBe('01-intro');
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });

  it('returns null for missing, corrupt or outdated data', async () => {
    const store = memoryStore();
    const storage = new KeyValueStorage(store);
    expect(await storage.load()).toBeNull();
    store.setItem('root-access:save', 'not json');
    expect(await storage.load()).toBeNull();
    store.setItem('root-access:save', JSON.stringify({ schemaVersion: 999 }));
    expect(await storage.load()).toBeNull();
  });

  it('survives a throwing store without crashing', async () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const storage = new KeyValueStorage(throwing);
    expect(await storage.load()).toBeNull();
    await expect(storage.save(SAVE)).resolves.toBeUndefined();
    await expect(storage.clear()).resolves.toBeUndefined();
  });
});

describe('NULL_GAME', () => {
  it('is a no-op game with no level', async () => {
    expect(NULL_GAME.mission()).toBeNull();
    expect(NULL_GAME.status()).toBeNull();
    expect(NULL_GAME.levels()).toEqual([]);
    expect(NULL_GAME.revealedHints()).toEqual([]);
    expect(NULL_GAME.nextHint()).toEqual({ status: 'no-level' });
    expect(NULL_GAME.startLevel('x')).toBe('unknown');
    expect(await NULL_GAME.submitFlag('FLAG{x}')).toEqual({ status: 'no-level' });
    expect(() => NULL_GAME.resetLevel()).not.toThrow();
  });
});
