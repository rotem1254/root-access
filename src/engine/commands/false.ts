import { defineCommand } from './define';

export const falseCommand = defineCommand({
  name: 'false',
  kind: 'builtin',
  handlesHelp: false,
  description: 'Return an unsuccessful result.',
  usage: [],
  about: 'Exit Status:\nAlways fails.',
  examples: [['false || echo fallback', '|| runs the next command because false fails']],
  seeAlso: ['true(1)'],
  run: async () => 1,
});
