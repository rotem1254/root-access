import type { LevelStub } from '../engine/game/level';

/** Chapter 2 and 3 placeholders, shown as "coming soon" in the levels list. */
export const CHAPTER_2_STUBS: readonly LevelStub[] = [
  {
    id: '04-first-contact',
    chapter: 2,
    title: 'First Contact',
    briefing:
      'Chapter 2, "Lateral Movement", takes the investigation onto the network. You will scan hosts, ' +
      'read what services they expose, and follow the leaker from one machine to the next.',
    objective: 'Map the network and find the next foothold. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '05-open-ports',
    chapter: 2,
    title: 'Open Ports',
    briefing: 'Enumerate a host with nmap and identify the service that lets you move deeper.',
    objective: 'Find and use an exposed service. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '06-hop-the-fence',
    chapter: 2,
    title: 'Hop the Fence',
    briefing:
      'Use recovered credentials to ssh from one machine to another and keep the trail alive.',
    objective: 'Pivot to the next host over ssh. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '07-packet-trail',
    chapter: 2,
    title: 'Packet Trail',
    briefing:
      "A captured pcap holds the leaker's traffic. Read it back and extract what they sent.",
    objective: 'Recover the payload from a packet capture. (Coming soon.)',
    comingSoon: true,
  },
];

export const CHAPTER_3_STUBS: readonly LevelStub[] = [
  {
    id: '08-the-cipher',
    chapter: 3,
    title: 'The Cipher',
    briefing:
      'Chapter 3, "Breaking the Cipher", turns to cryptography. The leaker encrypted their notes; ' +
      'you will hash, encode and decrypt your way to the truth.',
    objective: 'Identify and undo a simple cipher. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '09-hash-match',
    chapter: 3,
    title: 'Hash Match',
    briefing: 'Match a leaked hash against a wordlist to recover the value behind it.',
    objective: 'Crack a hash with a wordlist. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '10-keys-to-the-kingdom',
    chapter: 3,
    title: 'Keys to the Kingdom',
    briefing:
      "Decrypt an intercepted message with a recovered key and read the leaker's instructions.",
    objective: 'Decrypt the intercepted message. (Coming soon.)',
    comingSoon: true,
  },
  {
    id: '11-the-whole-story',
    chapter: 3,
    title: 'The Whole Story',
    briefing:
      'The final Chapter 3 challenge assembles every technique to unmask who was behind the leak.',
    objective: 'Unmask the leaker. (Coming soon.)',
    comingSoon: true,
  },
];
