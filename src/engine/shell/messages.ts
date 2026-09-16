/** Shell-level messages. Real bash wording where bash has it; honest notes where we don't. */

export const syntaxError = (token: string): string =>
  `bash: syntax error near unexpected token \`${token}'`;

export const notSupported = (feature: string): string =>
  `bash: ${feature} is not supported in this simulation`;

export const UNSUPPORTED = {
  commandSubstitution: notSupported('command substitution $(...)'),
  backticks: notSupported('command substitution `...`'),
  arithmetic: notSupported('arithmetic expansion $((...))'),
  stringLength: notSupported('${#VAR} (string length)'),
  parameterOperators: notSupported('parameter expansion with operators like ${VAR:-default}'),
  background: notSupported('running jobs in the background (&)'),
  subshell: notSupported('grouping commands in a subshell ( ... )'),
  hereDocument: notSupported('here-documents (<<)'),
  hereString: notSupported('here-strings (<<<)'),
  processSubstitution: notSupported('process substitution <(...)'),
  inputDuplication: notSupported('duplicating input descriptors (<&)'),
  closeDescriptor: notSupported('closing file descriptors (>&-)'),
} as const;
