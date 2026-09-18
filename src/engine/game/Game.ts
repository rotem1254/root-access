import type { CommandRegistry } from '../commands/types';
import { deserializeRoot, serializeNode } from '../fs/serialize';
import { Shell, type ShellHooks } from '../shell/Shell';
import { buildNetwork, type Machine } from '../system/Machine';
import type { Network } from '../network/Network';
import type { HostDefinition } from '../system/host';
import type { Clock } from '../util/clock';
import { ManualClock } from '../util/clock';
import { sha256Hex } from '../util/sha256';
import type {
  GameAPI,
  HintResult,
  LevelState,
  LevelSummary,
  MissionInfo,
  RunRow,
  RunSummary,
  StartLevelResult,
  StatusInfo,
  SubmitResult,
} from './api';
import type { GameEvent, GameListener } from './events';
import { checkFlag } from './flag';
import { isStub, type Level, type LevelCatalog, type LevelEntry, localize } from './level';
import { computeScore, SCORING } from './scoring';
import {
  emptySave,
  type GameStorage,
  MemoryStorage,
  type SaveData,
  SAVE_SCHEMA_VERSION,
  type SessionSnapshot,
} from './storage';

/** The story clock starts here; file mtimes and logs are stable across runs. */
export const STORY_EPOCH = Date.parse('2026-03-14T09:00:00Z');

export interface GameOptions {
  catalog: LevelCatalog;
  registry: CommandRegistry;
  storage?: GameStorage;
  /** Real-time source for the active-play timer. Defaults to the system clock. */
  clock?: Clock;
  columns?: () => number;
  io: { stdout(chunk: string): void; stderr(chunk: string): void };
  /** Play time starts paused until resume() is called (e.g. when the tab is visible). */
  startPaused?: boolean;
}

type PendingAction = { kind: 'reset' } | { kind: 'start'; id: string } | null;

/** Orchestrates a play session: builds each level's machine and shell, tracks progress. */
export class Game {
  readonly catalog: LevelCatalog;
  private readonly registry: CommandRegistry;
  private readonly storage: GameStorage;
  private readonly clock: Clock;
  private readonly columns: () => number;
  private readonly io: { stdout(chunk: string): void; stderr(chunk: string): void };
  private readonly listeners = new Set<GameListener>();

  private save: SaveData;
  private shellInstance!: Shell;
  private machineInstance!: Machine;
  private networkInstance!: Network;
  private currentLevel!: Level;
  private revealedCount = 0;
  private wrongThisLevel = 0;
  private readonly onceKeys = new Set<string>();
  private pending: PendingAction = null;

  private activeAccum = 0;
  private runningSince: number | null = null;

  private constructor(options: GameOptions, save: SaveData) {
    this.catalog = options.catalog;
    this.registry = options.registry;
    this.storage = options.storage ?? new MemoryStorage();
    this.clock = options.clock ?? { now: () => Date.now() };
    this.columns = options.columns ?? (() => 80);
    this.io = options.io;
    this.save = save;
  }

  /** Builds a game and loads the current (or first) level. */
  static async create(options: GameOptions): Promise<Game> {
    const firstPlayable = options.catalog.find((entry): entry is Level => !isStub(entry));
    if (!firstPlayable) throw new Error('catalog has no playable levels');
    const storage = options.storage ?? new MemoryStorage();
    const loaded = await storage.load();
    const save = loaded ?? emptySave(firstPlayable.id);
    const game = new Game({ ...options, storage }, save);
    const startId = game.levelById(save.currentLevelId) ? save.currentLevelId : firstPlayable.id;
    game.loadLevel(startId, save.session);
    if (!options.startPaused) game.resume();
    return game;
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  get shell(): Shell {
    return this.shellInstance;
  }

  get machine(): Machine {
    return this.machineInstance;
  }

  get network(): Network {
    return this.networkInstance;
  }

  get level(): Level {
    return this.currentLevel;
  }

  get api(): GameAPI {
    return {
      mission: () => this.mission(),
      submitFlag: (candidate) => this.submitFlag(candidate),
      nextHint: () => this.nextHint(),
      revealedHints: () => this.revealedHints(),
      status: () => this.status(),
      resetLevel: () => {
        this.pending = { kind: 'reset' };
      },
      levels: () => this.levels(),
      startLevel: (idOrNumber) => this.requestStartLevel(idOrNumber),
      runSummary: () => this.runSummary(),
    };
  }

  get locale(): 'en' | 'he' {
    return this.save.settings.locale;
  }

  // ── Events and timing ─────────────────────────────────────────────────

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Resume the active-play timer (tab visible). */
  resume(): void {
    this.runningSince ??= this.clock.now();
  }

  /** Pause the active-play timer (tab hidden). */
  pause(): void {
    if (this.runningSince !== null) {
      this.activeAccum += this.clock.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  activeMs(): number {
    return (
      this.activeAccum + (this.runningSince !== null ? this.clock.now() - this.runningSince : 0)
    );
  }

  // ── Level loading ─────────────────────────────────────────────────────

  private levelById(id: string): LevelEntry | undefined {
    return this.catalog.find((entry) => entry.id === id);
  }

  private levelNumber(id: string): number {
    return this.catalog.findIndex((entry) => entry.id === id) + 1;
  }

  private contentHash(level: Level): string {
    return sha256Hex(
      JSON.stringify({
        fs: level.fs,
        flag: level.flagHash,
        users: level.users ?? [],
        hosts: (level.hosts ?? []).map((host) => host.hostname),
      }),
    );
  }

  private hooks(): ShellHooks {
    return {
      onCommand: (command) => {
        this.currentLevel.onCommand?.(
          {
            name: command.name,
            args: command.args,
            exitCode: command.exitCode,
            user: command.user,
            cwd: command.cwd,
          },
          {
            echo: (text) => this.io.stdout(text.endsWith('\n') ? text : `${text}\n`),
            once: (key) => {
              if (this.onceKeys.has(key)) return false;
              this.onceKeys.add(key);
              return true;
            },
          },
        );
      },
      onLineComplete: () => {
        void this.afterLine();
      },
      onInputRequest: () => this.emit({ type: 'prompt-changed' }),
      onSessionChange: () => this.emit({ type: 'prompt-changed' }),
    };
  }

  private loadLevel(id: string, session: SessionSnapshot | null = null): void {
    const entry = this.levelById(id);
    if (!entry || isStub(entry)) throw new Error(`cannot load level: ${id}`);
    const level = entry;
    this.currentLevel = level;
    this.revealedCount = 0;
    this.wrongThisLevel = 0;
    this.onceKeys.clear();
    this.activeAccum = this.save.progress[id]?.activeMs ?? 0;
    this.runningSince = null;

    const clock = new ManualClock(STORY_EPOCH);
    const host: HostDefinition = {
      hostname: level.startHost,
      ...(level.users ? { users: level.users } : {}),
      ...(level.groups ? { groups: level.groups } : {}),
      ...(level.sudoers ? { sudoers: level.sudoers } : {}),
      fs: level.fs,
      ...(level.motd ? { motd: level.motd } : {}),
      ...(level.homeMode ? { homeMode: level.homeMode } : {}),
      ...(level.net ? { net: level.net } : {}),
    };
    this.networkInstance = buildNetwork([host, ...(level.hosts ?? [])], {
      clock,
      time: STORY_EPOCH,
      binaries: this.registry.binaries(),
      ...(level.network ? { network: level.network } : {}),
    });
    const startMachine = this.networkInstance.machineByHostname(level.startHost);
    if (!startMachine) throw new Error(`level ${id} has no start host ${level.startHost}`);
    this.machineInstance = startMachine;

    const restore =
      session?.levelId === id && session.contentHash === this.contentHash(level) ? session : null;
    if (restore) {
      this.machineInstance.fs.root.children = deserializeRoot(restore.fs).children;
      this.revealedCount = restore.hintsUsed;
      this.wrongThisLevel = restore.wrongSubmissions;
      this.activeAccum = restore.activeMs;
    }

    this.shellInstance = new Shell({
      network: this.networkInstance,
      host: level.startHost,
      registry: this.registry,
      game: this.api,
      user: level.startUser,
      cwd: level.startCwd,
      io: {
        stdout: (chunk) => this.io.stdout(chunk),
        stderr: (chunk) => this.io.stderr(chunk),
        columns: this.columns,
      },
      hooks: this.hooks(),
    });
    if (restore) this.shellInstance.restore({ sessions: restore.shells, history: restore.history });
    this.save.currentLevelId = id;
    this.emit({ type: 'level-started', levelId: id, number: this.levelNumber(id) });
  }

  private progressFor(id: string): SaveData['progress'][string] {
    let progress = this.save.progress[id];
    if (!progress) {
      progress = { hintsUsed: 0, activeMs: 0, wrongSubmissions: 0 };
      this.save.progress[id] = progress;
    }
    return progress;
  }

  private snapshotSession(): SessionSnapshot {
    const shell = this.shellInstance.snapshot();
    return {
      levelId: this.currentLevel.id,
      contentHash: this.contentHash(this.currentLevel),
      fs: serializeNode(this.machineInstance.fs.root),
      shells: shell.sessions,
      history: shell.history,
      hintsUsed: this.revealedCount,
      activeMs: this.activeMs(),
      wrongSubmissions: this.wrongThisLevel,
    };
  }

  /** Runs after each command line: applies deferred reset/start and persists. */
  private async afterLine(): Promise<void> {
    const pending = this.pending;
    this.pending = null;
    if (pending?.kind === 'reset') {
      this.loadLevel(this.currentLevel.id);
      this.resume();
      this.emit({ type: 'level-reset', levelId: this.currentLevel.id });
    } else if (pending?.kind === 'start') {
      this.loadLevel(pending.id);
      this.resume();
    }
    await this.persist();
  }

  async persist(): Promise<void> {
    const progress = this.progressFor(this.currentLevel.id);
    if (progress.completedAt === undefined) {
      progress.hintsUsed = this.revealedCount;
      progress.activeMs = this.activeMs();
      progress.wrongSubmissions = this.wrongThisLevel;
    }
    this.save.session = this.snapshotSession();
    await this.storage.save(this.save);
  }

  // ── GameAPI implementation ────────────────────────────────────────────

  private isCompleted(id: string): boolean {
    return this.save.progress[id]?.completedAt !== undefined;
  }

  mission(): MissionInfo {
    const level = this.currentLevel;
    return {
      levelId: level.id,
      number: this.levelNumber(level.id),
      chapter: level.chapter,
      title: localize(level.title, this.locale),
      objective: localize(level.objective, this.locale),
      briefing: localize(level.briefing, this.locale),
      skills: level.skills,
      hintsUsed: this.revealedCount,
      hintsTotal: level.hints.length,
      completed: this.isCompleted(level.id),
    };
  }

  async submitFlag(candidate: string): Promise<SubmitResult> {
    const level = this.currentLevel;
    if (this.isCompleted(level.id)) return { status: 'already-captured' };
    const result = checkFlag(candidate, level.flagHash);
    if (result === 'invalid-format') return { status: 'invalid-format' };
    if (result === 'incorrect') {
      this.wrongThisLevel += 1;
      this.progressFor(level.id).wrongSubmissions = this.wrongThisLevel;
      await this.persist();
      return { status: 'incorrect' };
    }
    const score = computeScore(this.revealedCount, this.activeMs(), level.parTimeSec);
    const progress = this.progressFor(level.id);
    progress.completedAt = new Date(STORY_EPOCH + this.activeMs()).toISOString();
    progress.score = score;
    progress.hintsUsed = this.revealedCount;
    progress.activeMs = this.activeMs();

    const newSkills = level.skills.filter((skill) => !this.save.unlockedSkills.includes(skill));
    this.save.unlockedSkills.push(...newSkills);
    const nextLevelId = this.nextPlayableAfter(level.id);
    await this.persist();
    if (newSkills.length > 0) this.emit({ type: 'skills-unlocked', skills: newSkills });
    this.emit({ type: 'flag-captured', levelId: level.id, score, newSkills, nextLevelId });
    const summary = this.runSummary();
    if (summary.complete) this.emit({ type: 'run-complete', totalScore: summary.totalScore });
    return { status: 'captured', levelId: level.id, score, nextLevelId };
  }

  nextHint(): HintResult {
    const level = this.currentLevel;
    if (this.revealedCount >= level.hints.length) {
      return { status: 'exhausted', total: level.hints.length };
    }
    const index = this.revealedCount;
    const text = localize(level.hints[index] ?? '', this.locale);
    this.revealedCount += 1;
    this.progressFor(level.id).hintsUsed = this.revealedCount;
    void this.persist();
    this.emit({ type: 'hint-revealed', levelId: level.id, index, total: level.hints.length });
    return { status: 'hint', index, total: level.hints.length, text };
  }

  revealedHints(): readonly string[] {
    return this.currentLevel.hints
      .slice(0, this.revealedCount)
      .map((hint) => localize(hint, this.locale));
  }

  /** Switches the UI language. Re-localizes on the fly; terminal command output stays English. */
  setLocale(locale: 'en' | 'he'): void {
    if (this.save.settings.locale === locale) return;
    this.save.settings.locale = locale;
    void this.persist();
    this.emit({ type: 'locale-changed', locale });
  }

  status(): StatusInfo {
    const level = this.currentLevel;
    const progress = this.save.progress[level.id];
    const completedCount = this.catalog.filter((entry) => this.isCompleted(entry.id)).length;
    const playableCount = this.catalog.filter((entry) => !isStub(entry)).length;
    const totalScore = Object.values(this.save.progress).reduce(
      (sum, p) => sum + (p.score?.total ?? 0),
      0,
    );
    return {
      levelId: level.id,
      number: this.levelNumber(level.id),
      title: localize(level.title, this.locale),
      chapter: level.chapter,
      hintsUsed: this.revealedCount,
      hintsTotal: level.hints.length,
      elapsedMs: this.activeMs(),
      wrongSubmissions: this.wrongThisLevel,
      completed: this.isCompleted(level.id),
      score: progress?.score ?? null,
      totalScore,
      levelsCompleted: completedCount,
      levelsTotal: playableCount,
    };
  }

  private levelStateOf(entry: LevelEntry, index: number): LevelState {
    if (isStub(entry)) return 'coming-soon';
    if (entry.id === this.currentLevel.id) return 'current';
    if (this.isCompleted(entry.id)) return 'completed';
    return this.isUnlocked(index) ? 'unlocked' : 'locked';
  }

  /** A level is unlocked when every playable level before it is completed. */
  private isUnlocked(index: number): boolean {
    for (let i = 0; i < index; i++) {
      const entry = this.catalog[i];
      if (entry && !isStub(entry) && !this.isCompleted(entry.id)) return false;
    }
    return true;
  }

  /** The end-of-run scoring screen: one row per playable level, plus totals. */
  runSummary(): RunSummary {
    const playable = this.catalog.filter((entry): entry is Level => !isStub(entry));
    const rows: RunRow[] = playable.map((level, index) => {
      const progress = this.save.progress[level.id];
      const completed = progress?.completedAt !== undefined;
      // The level in play has not been saved yet, so read its live timer.
      const live = level.id === this.currentLevel.id;
      return {
        id: level.id,
        number: this.levelNumber(level.id) || index + 1,
        chapter: level.chapter,
        title: localize(level.title, this.locale),
        completed,
        hintsUsed: live ? this.revealedCount : (progress?.hintsUsed ?? 0),
        elapsedMs: live ? this.activeMs() : (progress?.activeMs ?? 0),
        score: progress?.score?.total ?? 0,
      };
    });
    const completedRows = rows.filter((row) => row.completed);
    return {
      rows,
      levelsCompleted: completedRows.length,
      levelsTotal: rows.length,
      totalScore: rows.reduce((sum, row) => sum + row.score, 0),
      maxScore: rows.length * (SCORING.base + SCORING.maxSpeedBonus),
      totalHints: rows.reduce((sum, row) => sum + row.hintsUsed, 0),
      totalMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
      complete: rows.length > 0 && completedRows.length === rows.length,
    };
  }

  levels(): readonly LevelSummary[] {
    return this.catalog.map((entry, index) => ({
      id: entry.id,
      number: index + 1,
      chapter: entry.chapter,
      title: localize(entry.title, this.locale),
      state: this.levelStateOf(entry, index),
    }));
  }

  private nextPlayableAfter(id: string): string | null {
    const start = this.catalog.findIndex((entry) => entry.id === id);
    for (let i = start + 1; i < this.catalog.length; i++) {
      const entry = this.catalog[i];
      if (entry && !isStub(entry)) return entry.id;
    }
    return null;
  }

  private requestStartLevel(idOrNumber: string): StartLevelResult {
    const index = /^\d+$/.test(idOrNumber)
      ? Number(idOrNumber) - 1
      : this.catalog.findIndex((entry) => entry.id === idOrNumber);
    const entry = this.catalog[index];
    if (!entry) return 'unknown';
    if (isStub(entry)) return 'coming-soon';
    if (!this.isUnlocked(index)) return 'locked';
    this.pending = { kind: 'start', id: entry.id };
    return 'ok';
  }

  /** Marks the boot animation as seen (persisted with the next save). */
  markBootSeen(): void {
    this.save.settings.bootSeen = true;
  }

  get bootSeen(): boolean {
    return this.save.settings.bootSeen;
  }

  get unlockedSkills(): readonly string[] {
    return this.save.unlockedSkills;
  }

  /** Clears all saved progress and reloads the first level. */
  async resetAll(): Promise<void> {
    await this.storage.clear();
    const first = this.catalog.find((entry): entry is Level => !isStub(entry));
    this.save = emptySave(first?.id ?? this.currentLevel.id);
    this.loadLevel(this.save.currentLevelId);
    this.resume();
    await this.persist();
  }

  get schemaVersion(): number {
    return SAVE_SCHEMA_VERSION;
  }
}
