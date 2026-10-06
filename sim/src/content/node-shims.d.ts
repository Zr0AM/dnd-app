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
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
