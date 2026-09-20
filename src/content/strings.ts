/**
 * All UI chrome text (tabs, buttons, labels) lives here in English and Hebrew.
 * Terminal output — bash and coreutils errors, man pages, command --help — stays in English, like
 * a real Linux system. Per-level story text lives with the level (as a Localized value).
 */
export type Locale = 'en' | 'he';

export interface UIStrings {
  appName: string;
  dir: 'ltr' | 'rtl';
  tabs: {
    mission: string;
    story: string;
    hints: string;
    skills: string;
    guide: string;
    map: string;
  };
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
  buttons: { skipBoot: string; menu: string; hint: string; language: string; practice: string };
  boot: { pressToSkip: string; ready: string };
  capture: { title: string; score: string; next: string };
  guide: { searchPlaceholder: string; noMatches: string };
  map: { title: string; capturedLabel: string; current: string; locked: string };
  settings: {
    title: string;
    textSize: string;
    sizeSmall: string;
    sizeMedium: string;
    sizeLarge: string;
    sizeXLarge: string;
    contrast: string;
    contrastNormal: string;
    contrastHigh: string;
    open: string;
    done: string;
  };
  welcome: {
    tagline: string;
    whatTitle: string;
    whatBody: string;
    howTitle: string;
    steps: readonly string[];
    lessonsNote: string;
    start: string;
    reopen: string;
    dialogLabel: string;
  };
}

const en: UIStrings = {
  appName: 'ROOT_ACCESS',
  dir: 'ltr',
  tabs: {
    mission: 'Mission',
    story: 'Story',
    hints: 'Hints',
    skills: 'Skills',
    guide: 'Commands',
    map: 'Map',
  },
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
  buttons: {
    skipBoot: 'Skip',
    menu: 'Menu',
    hint: 'Hint',
    language: 'עברית',
    practice: 'Practice',
  },
  boot: { pressToSkip: 'press any key to skip', ready: 'Ready.' },
  capture: { title: 'FLAG CAPTURED', score: 'Score', next: 'Next level unlocked' },
  guide: { searchPlaceholder: 'Search commands…', noMatches: 'No commands match your search.' },
  map: {
    title: 'Your journey',
    capturedLabel: 'captured',
    current: 'you are here',
    locked: 'locked',
  },
  settings: {
    title: 'Display settings',
    textSize: 'Text size',
    sizeSmall: 'Small',
    sizeMedium: 'Medium',
    sizeLarge: 'Large',
    sizeXLarge: 'Extra large',
    contrast: 'Contrast',
    contrastNormal: 'Normal',
    contrastHigh: 'High contrast',
    open: 'Display settings',
    done: 'Done',
  },
  welcome: {
    tagline: 'Learn real hacking by playing in a safe, simulated Linux terminal.',
    whatTitle: 'What is this?',
    whatBody:
      'A puzzle game where you solve challenges by typing real Linux commands. ' +
      'Nothing here is connected to the internet and nothing can break — it is all a simulation, ' +
      'so experiment freely.',
    howTitle: 'How to play',
    steps: [
      'Type a command in the terminal on the left and press Enter. Try `ls` to start.',
      'The panel on the right shows your Mission. Stuck? Open the Hints tab for a nudge.',
      'Each level hides a flag that looks like FLAG{...}. Hand it in with `submit FLAG{...}` to win.',
    ],
    lessonsNote:
      'Never used a terminal? Perfect. The first few lessons teach you everything from zero — one command at a time.',
    start: 'Start playing',
    reopen: 'How to play',
    dialogLabel: 'Welcome and how to play',
  },
};

const he: UIStrings = {
  appName: 'ROOT_ACCESS',
  dir: 'rtl',
  tabs: {
    mission: 'משימה',
    story: 'סיפור',
    hints: 'רמזים',
    skills: 'מיומנויות',
    guide: 'פקודות',
    map: 'מפה',
  },
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
  buttons: { skipBoot: 'דלג', menu: 'תפריט', hint: 'רמז', language: 'English', practice: 'תרגול' },
  boot: { pressToSkip: 'הקישו מקש כלשהו כדי לדלג', ready: 'מוכן.' },
  capture: { title: 'הדגל נלכד', score: 'ניקוד', next: 'השלב הבא נפתח' },
  guide: { searchPlaceholder: 'חיפוש פקודות…', noMatches: 'אין פקודות שמתאימות לחיפוש.' },
  map: {
    title: 'המסע שלכם',
    capturedLabel: 'נלכדו',
    current: 'אתם כאן',
    locked: 'נעול',
  },
  settings: {
    title: 'הגדרות תצוגה',
    textSize: 'גודל טקסט',
    sizeSmall: 'קטן',
    sizeMedium: 'רגיל',
    sizeLarge: 'גדול',
    sizeXLarge: 'גדול מאוד',
    contrast: 'ניגודיות',
    contrastNormal: 'רגילה',
    contrastHigh: 'ניגודיות גבוהה',
    open: 'הגדרות תצוגה',
    done: 'סיום',
  },
  welcome: {
    tagline: 'ללמוד האקינג אמיתי דרך משחק, בטרמינל לינוקס מדומה ובטוח.',
    whatTitle: 'מה זה?',
    whatBody:
      'משחק חשיבה שבו פותרים אתגרים על ידי הקלדת פקודות לינוקס אמיתיות. שום דבר כאן לא מחובר ' +
      'לאינטרנט ואי אפשר לשבור כלום — הכול סימולציה, אז תתנסו בחופשיות.',
    howTitle: 'איך משחקים',
    steps: [
      'הקלידו פקודה בטרמינל שמימין ולחצו Enter. התחילו עם `ls`.',
      'הלוח שמשמאל מציג את המשימה שלכם. תקועים? פתחו את לשונית הרמזים.',
      'בכל שלב מוסתר דגל שנראה כמו FLAG{...}. הגישו אותו עם `submit FLAG{...}` כדי לנצח.',
    ],
    lessonsNote:
      'לא נגעתם בטרמינל מעולם? מצוין. השיעורים המודרכים הראשונים מלמדים אתכם הכול מאפס — פקודה אחת בכל פעם.',
    start: 'להתחיל לשחק',
    reopen: 'איך משחקים',
    dialogLabel: 'ברוכים הבאים ואיך משחקים',
  },
};

export function strings(locale: Locale): UIStrings {
  return locale === 'he' ? he : en;
}
