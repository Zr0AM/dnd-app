// Minimal ambient declarations for the few Node built-ins the DB loader uses, so
// `tsc` type-checks the sim package without pulling in all of @types/node. These
// cover only the surface load-db.ts touches; they are not a general Node typing.

declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string, options?: { readonly readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: unknown[]): Record<string, unknown>[];
      get(...params: unknown[]): Record<string, unknown> | undefined;
    };
    close(): void;
  }
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:readline/promises' {
  interface Interface {
    question(query: string): Promise<string>;
    close(): void;
  }
  export function createInterface(options: {
    readonly input: unknown;
    readonly output: unknown;
  }): Interface;
}

declare module 'node:process' {
  const process: {
    readonly argv: string[];
    readonly stdin: unknown;
    readonly stdout: { write(s: string): void };
    exit(code?: number): never;
  };
  export default process;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
