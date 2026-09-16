import type { Game } from '../engine/game/Game';
import type { GameEvent } from '../engine/game/events';
import { strings, type UIStrings } from '../content/strings';
import { clear, el, on } from './dom';

type TabId = 'mission' | 'story' | 'hints' | 'skills';

/** The right-hand side panel: HUD plus Mission / Story / Hints / Skills tabs. */
export class Panels {
  readonly root: HTMLElement;
  private readonly game: Game;
  private readonly ui: UIStrings;
  private active: TabId = 'mission';
  private readonly hud = el('div', { class: 'hud' });
  private readonly tabBar = el('div', { class: 'tabbar' });
  private readonly body = el('div', { class: 'panel-body' });
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private onFocusTerminal: () => void = () => undefined;

  constructor(game: Game) {
    this.game = game;
    this.ui = strings(game.locale);
    this.root = el('aside', { class: 'panel' }, [this.hud, this.tabBar, this.body]);
    this.buildTabs();
    game.subscribe((event) => this.onEvent(event));
  }

  setFocusTerminal(fn: () => void): void {
    this.onFocusTerminal = fn;
  }

  private buildTabs(): void {
    const tabs: [TabId, string][] = [
      ['mission', this.ui.tabs.mission],
      ['story', this.ui.tabs.story],
      ['hints', this.ui.tabs.hints],
      ['skills', this.ui.tabs.skills],
    ];
    for (const [id, label] of tabs) {
      const button = el('button', { class: 'tab', text: label, type: 'button' });
      on(button, 'click', () => this.select(id));
      this.tabButtons.set(id, button);
      this.tabBar.append(button);
    }
  }

  private select(id: TabId): void {
    this.active = id;
    this.render();
  }

  private onEvent(event: GameEvent): void {
    if (event.type === 'hint-revealed') this.active = 'hints';
    if (event.type === 'flag-captured') this.active = 'mission';
    this.render();
  }

  render(): void {
    this.renderHud();
    for (const [id, button] of this.tabButtons)
      button.classList.toggle('active', id === this.active);
    clear(this.body);
    switch (this.active) {
      case 'mission':
        this.body.append(this.missionView());
        break;
      case 'story':
        this.body.append(this.storyView());
        break;
      case 'hints':
        this.body.append(this.hintsView());
        break;
      case 'skills':
        this.body.append(this.skillsView());
        break;
    }
  }

  private renderHud(): void {
    const status = this.game.status();
    clear(this.hud);
    const stat = (label: string, value: string): HTMLElement =>
      el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: label }),
        el('span', { class: 'stat-value', text: value }),
      ]);
    const minutes = Math.floor(status.elapsedMs / 60000);
    const seconds = Math.floor((status.elapsedMs % 60000) / 1000);
    this.hud.append(
      stat(this.ui.hud.level, `${status.number}/${status.levelsTotal}`),
      stat(this.ui.hud.time, `${minutes}:${String(seconds).padStart(2, '0')}`),
      stat(this.ui.hud.hints, `${status.hintsUsed}/${status.hintsTotal}`),
      stat(this.ui.hud.score, String(status.totalScore)),
    );
  }

  private missionView(): HTMLElement {
    const mission = this.game.mission();
    const container = el('div', { class: 'view' });
    container.append(
      el('h2', { text: `${mission.number}. ${mission.title}` }),
      el('div', { class: 'chapter-tag', text: `Chapter ${mission.chapter}` }),
      el('h3', { text: this.ui.panel.objective }),
      el('p', { class: 'objective', text: mission.objective }),
      el('h3', { text: this.ui.panel.skillsThisLevel }),
      el(
        'ul',
        { class: 'skill-list' },
        mission.skills.map((skill) => el('li', { text: skill })),
      ),
    );
    if (mission.completed)
      container.append(el('div', { class: 'captured-badge', text: '✓ Captured' }));
    return container;
  }

  private storyView(): HTMLElement {
    const mission = this.game.mission();
    const container = el('div', { class: 'view' });
    container.append(el('h2', { text: this.ui.panel.briefing }));
    for (const para of mission.briefing.split('\n\n')) container.append(el('p', { text: para }));
    return container;
  }

  private hintsView(): HTMLElement {
    const mission = this.game.mission();
    const container = el('div', { class: 'view' });
    const revealed = this.game.revealedHints();
    container.append(el('h2', { text: this.ui.tabs.hints }));
    if (revealed.length === 0) {
      container.append(el('p', { class: 'muted', text: this.ui.panel.noHints }));
    } else {
      revealed.forEach((text, index) => {
        container.append(
          el('div', { class: 'hint' }, [
            el('span', { class: 'hint-number', text: `Hint ${index + 1}` }),
            el('p', { text }),
          ]),
        );
      });
    }
    if (revealed.length < mission.hintsTotal && !mission.completed) {
      const cost = [10, 20, 30][Math.min(revealed.length, 2)] ?? 30;
      const button = el('button', {
        class: 'reveal-hint',
        type: 'button',
        text: `${this.ui.panel.revealHint} (−${cost} pts)`,
      });
      on(button, 'click', () => {
        this.game.nextHint();
        this.onFocusTerminal();
      });
      container.append(button);
    }
    return container;
  }

  private skillsView(): HTMLElement {
    const container = el('div', { class: 'view' });
    const unlocked = this.game.unlockedSkills;
    container.append(el('h2', { text: this.ui.panel.unlockedSkills }));
    if (unlocked.length === 0) {
      container.append(el('p', { class: 'muted', text: this.ui.panel.noSkillsYet }));
    } else {
      container.append(
        el(
          'ul',
          { class: 'skill-list unlocked' },
          unlocked.map((skill) => el('li', { text: skill })),
        ),
      );
    }
    return container;
  }
}
