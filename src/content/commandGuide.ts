/**
 * A curated, bilingual quick-reference of the commands, shown in the panel's "Commands" tab so a
 * beginner never has to leave the game to remember what something does. Command names and examples
 * stay in Latin (they are typed into the terminal); the descriptions are localized.
 */
import type { Locale } from './strings';

export interface GuideEntry {
  name: string;
  en: string;
  he: string;
  example: string;
}

export interface GuideCategory {
  id: string;
  label: { en: string; he: string };
  entries: readonly GuideEntry[];
}

export const COMMAND_GUIDE: readonly GuideCategory[] = [
  {
    id: 'basics',
    label: { en: 'Basics', he: 'יסודות' },
    entries: [
      { name: 'ls', en: 'List the files here', he: 'הצגת הקבצים כאן', example: 'ls -la' },
      { name: 'cd', en: 'Change folder', he: 'מעבר בין תיקיות', example: 'cd projects' },
      { name: 'pwd', en: 'Show the current folder', he: 'הצגת התיקייה הנוכחית', example: 'pwd' },
      { name: 'cat', en: 'Read a file', he: 'קריאת קובץ', example: 'cat notes.txt' },
      { name: 'clear', en: 'Clear the screen', he: 'ניקוי המסך', example: 'clear' },
      { name: 'man', en: 'Manual for a command', he: 'מדריך לפקודה', example: 'man ls' },
      { name: 'help', en: 'List every command', he: 'רשימת כל הפקודות', example: 'help' },
    ],
  },
  {
    id: 'files',
    label: { en: 'Files', he: 'קבצים' },
    entries: [
      { name: 'cp', en: 'Copy a file', he: 'העתקת קובץ', example: 'cp a.txt b.txt' },
      {
        name: 'mv',
        en: 'Move or rename a file',
        he: 'העברה או שינוי שם',
        example: 'mv a.txt docs/',
      },
      { name: 'rm', en: 'Delete a file', he: 'מחיקת קובץ', example: 'rm old.txt' },
      { name: 'mkdir', en: 'Make a folder', he: 'יצירת תיקייה', example: 'mkdir data' },
      { name: 'touch', en: 'Create an empty file', he: 'יצירת קובץ ריק', example: 'touch new.txt' },
      { name: 'chmod', en: 'Change permissions', he: 'שינוי הרשאות', example: 'chmod 644 f.txt' },
      { name: 'file', en: 'Identify a file type', he: 'זיהוי סוג קובץ', example: 'file data.bin' },
    ],
  },
  {
    id: 'text',
    label: { en: 'Searching & text', he: 'חיפוש וטקסט' },
    entries: [
      {
        name: 'grep',
        en: 'Find lines matching a word',
        he: 'מציאת שורות עם מילה',
        example: 'grep error log.txt',
      },
      {
        name: 'find',
        en: 'Find files by name or property',
        he: 'מציאת קבצים',
        example: 'find . -name "*.txt"',
      },
      {
        name: 'head',
        en: 'First lines of a file',
        he: 'שורות ראשונות',
        example: 'head -n 5 log.txt',
      },
      {
        name: 'tail',
        en: 'Last lines of a file',
        he: 'שורות אחרונות',
        example: 'tail -n 5 log.txt',
      },
      {
        name: 'wc',
        en: 'Count lines, words, bytes',
        he: 'ספירת שורות/מילים',
        example: 'wc -l log.txt',
      },
      { name: 'sort', en: 'Sort lines', he: 'מיון שורות', example: 'sort names.txt' },
      {
        name: 'uniq',
        en: 'Collapse repeated lines',
        he: 'איחוד שורות כפולות',
        example: 'sort f | uniq -c',
      },
      {
        name: 'cut',
        en: 'Pick columns from a line',
        he: 'בחירת עמודות',
        example: 'cut -d: -f1 /etc/passwd',
      },
      {
        name: 'tr',
        en: 'Replace characters (e.g. ROT13)',
        he: 'החלפת תווים',
        example: 'tr a-z A-Z',
      },
    ],
  },
  {
    id: 'crypto',
    label: { en: 'Encoding & crypto', he: 'קידוד והצפנה' },
    entries: [
      {
        name: 'base64',
        en: 'Encode / decode base64',
        he: 'קידוד/פענוח base64',
        example: 'base64 -d f.txt',
      },
      { name: 'xxd', en: 'Show a file as hex', he: 'הצגת קובץ כ-hex', example: 'xxd -l 16 f.bin' },
      {
        name: 'md5sum',
        en: 'MD5 fingerprint of a file',
        he: 'טביעת אצבע MD5',
        example: 'md5sum f.iso',
      },
      {
        name: 'sha256sum',
        en: 'SHA-256 fingerprint / verify',
        he: 'טביעת אצבע SHA-256',
        example: 'sha256sum -c SUMS',
      },
      {
        name: 'openssl',
        en: 'Encrypt / decrypt / digest',
        he: 'הצפנה/פענוח',
        example: 'openssl enc -d -aes-256-cbc -in f.enc',
      },
      {
        name: 'john',
        en: 'Crack password hashes',
        he: 'פיצוח hash של סיסמאות',
        example: 'john --wordlist=w.txt h.txt',
      },
      {
        name: 'gpg',
        en: 'Decrypt a PGP message',
        he: 'פענוח הודעת PGP',
        example: 'gpg -d msg.asc',
      },
    ],
  },
  {
    id: 'network',
    label: { en: 'Network', he: 'רשת' },
    entries: [
      { name: 'ip', en: 'Show your address / routes', he: 'הצגת הכתובת שלכם', example: 'ip a' },
      {
        name: 'ping',
        en: 'Check a host is reachable',
        he: 'בדיקת נגישות מחשב',
        example: 'ping -c 4 10.10.0.1',
      },
      {
        name: 'nmap',
        en: 'Scan a host for open ports',
        he: 'סריקת פורטים',
        example: 'nmap -sV host',
      },
      {
        name: 'ss',
        en: 'List listening services',
        he: 'הצגת שירותים מאזינים',
        example: 'ss -tlnp',
      },
      {
        name: 'ssh',
        en: 'Log in to another machine',
        he: 'התחברות למחשב אחר',
        example: 'ssh user@host',
      },
      { name: 'curl', en: 'Fetch a URL', he: 'שליפת כתובת אינטרנט', example: 'curl http://host/' },
      {
        name: 'nc',
        en: 'Raw connection / banner grab',
        he: 'חיבור גולמי לפורט',
        example: 'nc -v host 22',
      },
      {
        name: 'dig',
        en: 'Resolve a hostname to an IP',
        he: 'תרגום שם לכתובת',
        example: 'dig +short host',
      },
      {
        name: 'tcpdump',
        en: 'Read a packet capture',
        he: 'קריאת לכידת תעבורה',
        example: 'tcpdump -r cap.pcap',
      },
    ],
  },
  {
    id: 'game',
    label: { en: 'The game', he: 'המשחק' },
    entries: [
      { name: 'mission', en: 'Show your objective', he: 'הצגת המשימה', example: 'mission' },
      { name: 'hint', en: 'Reveal the next hint', he: 'חשיפת רמז', example: 'hint' },
      { name: 'submit', en: 'Hand in a flag', he: 'הגשת דגל', example: 'submit FLAG{...}' },
      {
        name: 'status',
        en: 'Your time, hints and score',
        he: 'זמן, רמזים וניקוד',
        example: 'status',
      },
      {
        name: 'summary',
        en: 'The whole-run scoring screen',
        he: 'מסך הניקוד המסכם',
        example: 'summary',
      },
      {
        name: 'levels',
        en: 'List levels / switch level',
        he: 'רשימת שלבים/מעבר',
        example: 'levels 2',
      },
      { name: 'reset', en: "Restore the level's files", he: 'איפוס קובצי השלב', example: 'reset' },
    ],
  },
];

export interface FlatGuideEntry extends GuideEntry {
  category: string;
}

/** All entries whose name or (localized) description matches the query, with their category label. */
export function searchGuide(query: string, locale: Locale): FlatGuideEntry[] {
  const q = query.trim().toLowerCase();
  const out: FlatGuideEntry[] = [];
  for (const category of COMMAND_GUIDE) {
    const label = locale === 'he' ? category.label.he : category.label.en;
    for (const entry of category.entries) {
      const desc = locale === 'he' ? entry.he : entry.en;
      if (
        q === '' ||
        entry.name.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        entry.example.toLowerCase().includes(q)
      ) {
        out.push({ ...entry, category: label });
      }
    }
  }
  return out;
}
