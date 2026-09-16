interface Variable {
  value: string;
  exported: boolean;
}

/** Shell variables, the exported environment, the working directory and `$?`. */
export class Environment {
  cwd: string;
  lastStatus = 0;
  private readonly vars = new Map<string, Variable>();

  constructor(cwd: string, exported: Readonly<Record<string, string>> = {}) {
    this.cwd = cwd;
    for (const [name, value] of Object.entries(exported))
      this.vars.set(name, { value, exported: true });
  }

  get(name: string): string | undefined {
    return this.vars.get(name)?.value;
  }

  has(name: string): boolean {
    return this.vars.has(name);
  }

  /** Sets a variable, keeping its exported flag unless `export` is given. */
  set(name: string, value: string, options: { export?: boolean } = {}): void {
    const existing = this.vars.get(name);
    this.vars.set(name, { value, exported: options.export ?? existing?.exported ?? false });
  }

  /** Marks a variable exported; with a value, sets it too. `export NAME` on an unset name creates nothing. */
  export(name: string, value?: string): void {
    const existing = this.vars.get(name);
    if (value !== undefined) this.vars.set(name, { value, exported: true });
    else if (existing) existing.exported = true;
    else this.pendingExports.add(name);
  }

  unexport(name: string): void {
    const existing = this.vars.get(name);
    if (existing) existing.exported = false;
    this.pendingExports.delete(name);
  }

  unset(name: string): void {
    this.vars.delete(name);
    this.pendingExports.delete(name);
  }

  isExported(name: string): boolean {
    return this.vars.get(name)?.exported ?? this.pendingExports.has(name);
  }

  /** Names marked with `export NAME` before they had a value (shown by `export -p`). */
  readonly pendingExports = new Set<string>();

  /** Exported variables in the order they were first defined. */
  exported(): [string, string][] {
    return [...this.vars].filter(([, v]) => v.exported).map(([name, v]) => [name, v.value]);
  }

  names(): string[] {
    return [...this.vars.keys()];
  }

  clone(): Environment {
    const copy = new Environment(this.cwd);
    copy.lastStatus = this.lastStatus;
    for (const [name, variable] of this.vars) copy.vars.set(name, { ...variable });
    for (const name of this.pendingExports) copy.pendingExports.add(name);
    return copy;
  }
}
