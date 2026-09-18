/**
 * All UI chrome text (tabs, buttons, labels) lives here in English and Hebrew.
 * Terminal output — bash and coreutils errors, man pages, command --help — stays in English, like
 * a real Linux system. Per-level story text lives with the level (as a Localized value).
 */
export type Locale = 'en' | 'he';

export interface UIStrings {
  appName: string;
  dir: 'ltr' | 'rtl';
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
    chapter: string;
    captured: string;
    hint: string;
  };
  a11y: {
    terminalLabel: string;
    panelLabel: string;
    hudLabel: string;
    tabsLabel: string;
    touchKeysLabel: string;
    skipToTerminal: string;
    languageLabel: string;
    togglePanel: string;
  };
  buttons: { skipBoot: string; menu: string; hint: string; language: string };
  boot: { pressToSkip: string; ready: string };
  capture: { title: string; score: string; next: string };
}

const en: UIStrings = {
  appName: 'ROOT_ACCESS',
  dir: 'ltr',
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
    chapter: 'Chapter',
    captured: '✓ Captured',
    hint: 'Hint',
  },
  a11y: {
    terminalLabel: 'Terminal',
    panelLabel: 'Mission panel',
    hudLabel: 'Progress',
    tabsLabel: 'Panel sections',
    touchKeysLabel: 'On-screen keys',
    skipToTerminal: 'Skip to terminal',
    languageLabel: 'Language',
    togglePanel: 'Toggle the mission panel',
  },
  buttons: { skipBoot: 'Skip', menu: 'Menu', hint: 'Hint', language: 'עברית' },
  boot: { pressToSkip: 'press any key to skip', ready: 'Ready.' },
  capture: { title: 'FLAG CAPTURED', score: 'Score', next: 'Next level unlocked' },
};

const he: UIStrings = {
  appName: 'ROOT_ACCESS',
  dir: 'rtl',
  tabs: { mission: 'משימה', story: 'סיפור', hints: 'רמזים', skills: 'מיומנויות' },
  hud: { level: 'שלב', time: 'זמן', hints: 'רמזים', score: 'ניקוד', user: 'משתמש' },
  panel: {
    objective: 'מטרה',
    briefing: 'תדריך',
    skillsThisLevel: 'מיומנויות שתתרגלו',
    noHints: 'עדיין לא נחשפו רמזים. תקועים? חשפו רמז — או הקלידו `hint` בטרמינל.',
    revealHint: 'חשוף את הרמז הבא',
    hintCost: 'עולה נקודות',
    unlockedSkills: 'מיומנויות שנפתחו',
    noSkillsYet: 'לכדו את הדגל הראשון כדי להתחיל לפתוח מיומנויות.',
    comingSoon: 'בקרוב',
    chapter: 'פרק',
    captured: '✓ נלכד',
    hint: 'רמז',
  },
  a11y: {
    terminalLabel: 'טרמינל',
    panelLabel: 'לוח המשימה',
    hudLabel: 'התקדמות',
    tabsLabel: 'חלקי הלוח',
    touchKeysLabel: 'מקשים על המסך',
    skipToTerminal: 'דלגו לטרמינל',
    languageLabel: 'שפה',
    togglePanel: 'הצג או הסתר את לוח המשימה',
  },
  buttons: { skipBoot: 'דלג', menu: 'תפריט', hint: 'רמז', language: 'English' },
  boot: { pressToSkip: 'הקישו מקש כלשהו כדי לדלג', ready: 'מוכן.' },
  capture: { title: 'הדגל נלכד', score: 'ניקוד', next: 'השלב הבא נפתח' },
};

export function strings(locale: Locale): UIStrings {
  return locale === 'he' ? he : en;
}
