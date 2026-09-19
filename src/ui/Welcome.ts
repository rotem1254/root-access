import { strings } from '../content/strings';
import { el, on } from './dom';

/** The minimum the welcome overlay needs from the game: read and switch the language. */
export interface WelcomeHost {
  readonly locale: 'en' | 'he';
  setLocale(locale: 'en' | 'he'): void;
}

/** Renders a backtick-`code`-aware line: code spans stay left-to-right even in an RTL card. */
function richLine(text: string): (Node | string)[] {
  return text
    .split('`')
    .map((part, index) =>
      index % 2 === 1 ? el('code', { text: part, attrs: { dir: 'ltr' } }) : part,
    );
}

/**
 * Shows the "what is this / how to play" overlay as a modal dialog. Returns a promise that resolves
 * when the player dismisses it (Start button, Escape, or the backdrop). Keyboard focus is trapped
 * inside while it is open, and a language toggle lets a first-timer switch before starting.
 */
export function openWelcome(host: WelcomeHost): Promise<void> {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  return new Promise<void>((resolve) => {
    const overlay = el('div', { class: 'welcome-overlay' });
    const card = el('div', {
      class: 'welcome-card',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': strings(host.locale).welcome.dialogLabel,
      },
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
      // Trap focus within the card.
      const focusable = card.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const render = (): void => {
      const ui = strings(host.locale);
      const w = ui.welcome;
      card.dir = ui.dir;
      card.setAttribute('aria-label', w.dialogLabel);
      card.replaceChildren(
        el('div', { class: 'welcome-head' }, [
          el('h1', { class: 'welcome-title', text: ui.appName }),
          el('button', {
            class: 'welcome-lang',
            type: 'button',
            text: ui.buttons.language,
            attrs: { 'aria-label': ui.a11y.languageLabel },
          }),
        ]),
        el('p', { class: 'welcome-tagline', text: w.tagline }),
        el('h2', { text: w.whatTitle }),
        el('p', { text: w.whatBody }),
        el('h2', { text: w.howTitle }),
        el(
          'ol',
          { class: 'welcome-steps' },
          w.steps.map((step) => el('li', {}, richLine(step))),
        ),
        el('p', { class: 'welcome-note' }, richLine(w.lessonsNote)),
        el('button', { class: 'welcome-start', type: 'button', text: w.start }),
      );

      const langButton = card.querySelector<HTMLButtonElement>('.welcome-lang');
      if (langButton)
        on(langButton, 'click', () => {
          host.setLocale(host.locale === 'he' ? 'en' : 'he');
          render();
          card.querySelector<HTMLButtonElement>('.welcome-lang')?.focus();
        });
      const startButton = card.querySelector<HTMLButtonElement>('.welcome-start');
      if (startButton) {
        on(startButton, 'click', close);
        startButton.focus();
      }
    };

    on(overlay, 'click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    render();
    document.body.append(overlay);
  });
}
