// Types for build-number.mjs, so specs under src/ can import it without allowJs.
export declare const DEFAULT_REPO: string;
export declare const WORKFLOW_FILE: string;
export declare function resolveBuildDate(sourceDateEpoch: string | undefined, now?: Date): Date;
export declare function formatBuildNumber(date: Date, run: number | 'dev'): string;
export declare function parseRunNumber(value: string | undefined): number | null;
export declare function pickRunNumber(body: unknown, sha: string): number | null;
export interface LookupOptions {
  sha: string;
  token?: string;
  repo?: string;
  fetchImpl?: (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  attempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export declare function lookupRunNumber(
  options: LookupOptions,
): Promise<{ runNumber: number | null; error: string | null }>;
