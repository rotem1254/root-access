import { strings } from '../content/strings';
import {
  applyPrefs,
  FONT_SIZES,
  loadPrefs,
  savePrefs,
  type A11yPrefs,
  type FontSizeOption,
  type SettingsTarget,
} from './a11yPrefs';
import { el, on } from './dom';

export {
  applyPrefs,
  DEFAULT_PREFS,
  FONT_SIZES,
  loadPrefs,
  normalizePrefs,
  savePrefs,
  type A11yPrefs,
  type FontSizeOption,
  type SettingsTarget,
} from './a11yPrefs';

/**
 * A small settings controller: holds the current prefs, persists and applies changes live, and can
 * open an accessible modal dialog with the controls.
 */
export class Settings {
  private prefs: A11yPrefs;
  private readonly target: SettingsTarget;
  private readonly getLocale: () => 'en' | 'he';

  constructor(target: SettingsTarget, getLocale: () => 'en' | 'he') {
    this.target = target;
    this.getLocale = getLocale;
    this.prefs = loadPrefs();
  }

  /** Applies the loaded prefs (call once at startup, after the terminal is mounted). */
  apply(): void {
    applyPrefs(this.prefs, this.target);
  }

  private update(patch: Partial<A11yPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    applyPrefs(this.prefs, this.target);
  }

  /** Opens the settings dialog; resolves when it closes. */
  open(): Promise<void> {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return new Promise<void>((resolve) => {
      const overlay = el('div', { class: 'welcome-overlay' });
      const card = el('div', {
        class: 'welcome-card settings-card',
        attrs: { role: 'dialog', 'aria-modal': 'true' },
      });
      overlay.append(card);

      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        previouslyFocused?.focus();
        resolve();
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== 'Tab') return;
        const items = card.querySelectorAll<HTMLElement>('button');
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      const render = (): void => {
        const ui = strings(this.getLocale());
        const s = ui.settings;
        card.dir = ui.dir;
        card.setAttribute('aria-label', s.title);

        const sizeLabels: Record<FontSizeOption['id'], string> = {
          sm: s.sizeSmall,
          md: s.sizeMedium,
          lg: s.sizeLarge,
          xl: s.sizeXLarge,
        };
        const sizeGroup = el('div', {
          class: 'seg',
          attrs: { role: 'group', 'aria-label': s.textSize },
        });
        for (const option of FONT_SIZES) {
          const selected = this.prefs.fontScale === option.scale;
          const b = el('button', {
            class: `seg-btn${selected ? ' active' : ''}`,
            type: 'button',
            text: sizeLabels[option.id],
            attrs: { 'aria-pressed': selected ? 'true' : 'false' },
          });
          on(b, 'click', () => {
            this.update({ fontScale: option.scale });
            render();
          });
          sizeGroup.append(b);
        }

        const contrastGroup = el('div', {
          class: 'seg',
          attrs: { role: 'group', 'aria-label': s.contrast },
        });
        for (const value of ['normal', 'high'] as const) {
          const selected = this.prefs.contrast === value;
          const b = el('button', {
            class: `seg-btn${selected ? ' active' : ''}`,
            type: 'button',
            text: value === 'high' ? s.contrastHigh : s.contrastNormal,
            attrs: { 'aria-pressed': selected ? 'true' : 'false' },
          });
          on(b, 'click', () => {
            this.update({ contrast: value });
            render();
          });
          contrastGroup.append(b);
        }

        const done = el('button', { class: 'welcome-start', type: 'button', text: s.done });
        on(done, 'click', close);

        card.replaceChildren(
          el('h1', { class: 'welcome-title', text: s.title }),
          el('h2', { text: s.textSize }),
          sizeGroup,
          el('h2', { text: s.contrast }),
          contrastGroup,
          done,
        );
        done.focus();
      };

      on(overlay, 'click', (event) => {
        if (event.target === overlay) close();
      });
      document.addEventListener('keydown', onKey, true);
      render();
      document.body.append(overlay);
    });
  }
}
