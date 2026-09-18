/**
 * All UI chrome text (tabs, buttons, labels) lives here, ready for a Hebrew translation.
 * Terminal output stays in English, like a real Linux system. Level story text lives with the
 * level, not here.
 */
export type Locale = 'en' | 'he';

export interface UIStrings {
  appName: string;
  tabs: { mission: string; story: string; hints: string; skills: string };
  hud: { level: string; time: string; hints: string; score: string; user: string };
  panel: {
    objective: string;
    briefing: string;
    skillsThisLevel: string;
    noHints: string;
    revealHint: string;
    hintCost: string;
    unlockedSkills: string;
    noSkillsYet: string;
    comingSoon: string;
  };
  buttons: { skipBoot: string; menu: string; hint: string };
  boot: { pressToSkip: string; ready: string };
  capture: { title: string; score: string; next: string };
}

const en: UIStrings = {
  appName: 'ROOT_ACCESS',
  tabs: { mission: 'Mission', story: 'Story', hints: 'Hints', skills: 'Skills' },
  hud: { level: 'Level', time: 'Time', hints: 'Hints', score: 'Score', user: 'User' },
  panel: {
    objective: 'Objective',
    briefing: 'Briefing',
    skillsThisLevel: 'Skills you will practise',
    noHints: 'No hints revealed yet. Stuck? Reveal one — or type `hint` in the terminal.',
    revealHint: 'Reveal next hint',
    hintCost: 'costs points',
    unlockedSkills: 'Unlocked skills',
    noSkillsYet: 'Capture your first flag to start unlocking skills.',
    comingSoon: 'Coming soon',
  },
  buttons: { skipBoot: 'Skip', menu: 'Menu', hint: 'Hint' },
  boot: { pressToSkip: 'press any key to skip', ready: 'Ready.' },
  capture: { title: 'FLAG CAPTURED', score: 'Score', next: 'Next level unlocked' },
};

/** Hebrew is stubbed for now; the side panel is RTL-ready via CSS logical properties. */
const he: Partial<UIStrings> = {};

export function strings(locale: Locale): UIStrings {
  return locale === 'he' ? { ...en, ...he } : en;
}
