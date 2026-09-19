import type { Game } from '../engine/game/Game';
import type { GameEvent } from '../engine/game/events';
import { searchGuide } from '../content/commandGuide';
import { strings, type UIStrings } from '../content/strings';
import { clear, el, on } from './dom';

type TabId = 'mission' | 'story' | 'hints' | 'skills' | 'guide';

const TAB_ORDER: readonly TabId[] = ['mission', 'story', 'hints', 'skills', 'guide'];

/** The right-hand side panel: HUD plus Mission / Story / Hints / Skills tabs, keyboard-navigable. */
export class Panels {
  readonly root: HTMLElement;
  private readonly game: Game;
  private ui: UIStrings;
  private active: TabId = 'mission';
  private readonly hud = el('div', { class: 'hud', attrs: { role: 'group' } });
  private readonly tabBar = el('div', { class: 'tabbar', attrs: { role: 'tablist' } });
  private readonly body = el('div', {
    class: 'panel-body',
    id: 'panel-body',
    attrs: { role: 'tabpanel', tabindex: '0' },
  });
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private onFocusTerminal: () => void = () => undefined;
  private onLocaleChange: () => void = () => undefined;
  private guideQuery = '';

  constructor(game: Game) {
    this.game = game;
    this.ui = strings(game.locale);
    this.root = el('aside', { class: 'panel', attrs: { 'aria-label': this.ui.a11y.panelLabel } }, [
      this.hud,
      this.tabBar,
      this.body,
    ]);
    this.buildTabs();
    this.applyLocale();
    game.subscribe((event) => this.onEvent(event));
  }

  setFocusTerminal(fn: () => void): void {
    this.onFocusTerminal = fn;
  }

  /** Wires the "click an example to scaffold it into the terminal" behaviour of the guide. */
  setInsertCommand(fn: (text: string) => void): void {
    this.onInsertCommand = fn;
  }
  private onInsertCommand: (text: string) => void = () => undefined;

  /** Lets main.ts react to a language switch (set document dir/lang, redraw the toggle). */
  setLocaleChangeHandler(fn: () => void): void {
    this.onLocaleChange = fn;
  }

  private buildTabs(): void {
    for (const id of TAB_ORDER) {
      const button = el('button', {
        class: 'tab',
        type: 'button',
        id: `tab-${id}`,
        attrs: {
          role: 'tab',
          'aria-controls': 'panel-body',
          'aria-selected': 'false',
          tabindex: '-1',
        },
      });
      on(button, 'click', () => {
        this.select(id);
        button.focus();
      });
      on(button, 'keydown', (event) => this.onTabKey(event, id));
      this.tabButtons.set(id, button);
      this.tabBar.append(button);
    }
  }

  /** Arrow keys move between tabs (WAI-ARIA tablist pattern); Home/End jump to the ends. */
  private onTabKey(event: KeyboardEvent, id: TabId): void {
    const index = TAB_ORDER.indexOf(id);
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % TAB_ORDER.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TAB_ORDER.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = TAB_ORDER[next];
    if (target === undefined) return;
    this.select(target);
    this.tabButtons.get(target)?.focus();
  }

  private select(id: TabId): void {
    this.active = id;
    this.render();
  }

  private onEvent(event: GameEvent): void {
    if (event.type === 'hint-revealed') this.active = 'hints';
    if (event.type === 'flag-captured') this.active = 'mission';
    if (event.type === 'locale-changed') {
      this.ui = strings(this.game.locale);
      this.applyLocale();
      this.onLocaleChange();
    }
    this.render();
  }

  /** Applies the current locale's direction and labels to the panel container and tab labels. */
  private applyLocale(): void {
    this.root.setAttribute('aria-label', this.ui.a11y.panelLabel);
    this.root.setAttribute('dir', this.ui.dir);
    this.hud.setAttribute('aria-label', this.ui.a11y.hudLabel);
    this.tabBar.setAttribute('aria-label', this.ui.a11y.tabsLabel);
    const labels: Record<TabId, string> = {
      mission: this.ui.tabs.mission,
      story: this.ui.tabs.story,
      hints: this.ui.tabs.hints,
      skills: this.ui.tabs.skills,
      guide: this.ui.tabs.guide,
    };
    for (const [id, button] of this.tabButtons) button.textContent = labels[id];
  }

  render(): void {
    this.renderHud();
    for (const [id, button] of this.tabButtons) {
      const selected = id === this.active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('tabindex', selected ? '0' : '-1');
    }
    this.body.setAttribute('aria-labelledby', `tab-${this.active}`);
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
      case 'guide':
        this.body.append(this.guideView());
        break;
    }
  }

  private renderHud(): void {
    const status = this.game.status();
    clear(this.hud);
    const stat = (label: string, value: string): HTMLElement =>
      el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: label }),
        el('span', {
          class: 'stat-value',
          text: value,
          attrs: { 'aria-label': `${label}: ${value}` },
        }),
      ]);
    const minutes = Math.floor(status.elapsedMs / 60000);
    const seconds = Math.floor((status.elapsedMs % 60000) / 1000);
    // Practice has no place in the progression, so show a flask instead of a misleading "N/N".
    const levelValue = this.game.level.practice ? '🧪' : `${status.number}/${status.levelsTotal}`;
    this.hud.append(
      stat(this.ui.hud.level, levelValue),
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
      el('div', { class: 'chapter-tag', text: `${this.ui.panel.chapter} ${mission.chapter}` }),
      el('h3', { text: this.ui.panel.objective }),
      el('p', { class: 'objective', text: mission.objective }),
      el('h3', { text: this.ui.panel.skillsThisLevel }),
      el(
        'ul',
        { class: 'skill-list' },
        mission.skills.map((skill) => el('li', { attrs: { dir: 'ltr' } }, [skill])),
      ),
    );
    if (mission.completed)
      container.append(el('div', { class: 'captured-badge', text: this.ui.panel.captured }));
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
            el('span', { class: 'hint-number', text: `${this.ui.panel.hint} ${index + 1}` }),
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
        text: `${this.ui.panel.revealHint} (−${cost})`,
      });
      on(button, 'click', () => {
        this.game.nextHint();
        this.onFocusTerminal();
      });
      container.append(button);
    }
    return container;
  }

  private guideView(): HTMLElement {
    const container = el('div', { class: 'view' });
    container.append(el('h2', { text: this.ui.tabs.guide }));

    const search = el('input', {
      class: 'guide-search',
      attrs: {
        type: 'search',
        placeholder: this.ui.guide.searchPlaceholder,
        'aria-label': this.ui.guide.searchPlaceholder,
        dir: 'ltr',
        value: this.guideQuery,
      },
    });
    const results = el('div', { class: 'guide-results' });
    const renderResults = (): void => {
      clear(results);
      const matches = searchGuide(this.guideQuery, this.game.locale);
      if (matches.length === 0) {
        results.append(el('p', { class: 'muted', text: this.ui.guide.noMatches }));
        return;
      }
      let category = '';
      for (const entry of matches) {
        if (entry.category !== category) {
          category = entry.category;
          results.append(el('h3', { text: category }));
        }
        // Clicking an entry types its example into the terminal, so a beginner never has to.
        const row = el('button', { class: 'guide-entry', type: 'button' }, [
          el('code', { class: 'guide-name', text: entry.name, attrs: { dir: 'ltr' } }),
          el('span', {
            class: 'guide-desc',
            text: this.game.locale === 'he' ? entry.he : entry.en,
          }),
          el('code', { class: 'guide-eg', text: entry.example, attrs: { dir: 'ltr' } }),
        ]);
        on(row, 'click', () => this.onInsertCommand(entry.example));
        results.append(row);
      }
    };
    on(search, 'input', () => {
      this.guideQuery = search.value;
      renderResults();
    });
    renderResults();
    container.append(search, results);
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
          unlocked.map((skill) => el('li', { attrs: { dir: 'ltr' } }, [skill])),
        ),
      );
    }
    return container;
  }
}
