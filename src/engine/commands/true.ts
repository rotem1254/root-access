import { defineCommand } from './define';

export const trueCommand = defineCommand({
  name: 'true',
  kind: 'builtin',
  handlesHelp: false,
  description: 'Return a successful result.',
  usage: [],
  about: 'Exit Status:\nAlways succeeds.',
  examples: [['true && echo ran', '&& runs the next command because true succeeds']],
  seeAlso: ['false(1)'],
  run: async () => 0,
});
