// Types for build-number.mjs, so specs under src/ can import it without allowJs.
export declare function resolveBuildDate(sourceDateEpoch: string | undefined, now?: Date): Date;
export declare function formatBuildNumber(date: Date, run: number | 'dev'): string;
export declare function parseRunNumber(value: string | undefined): number | null;
