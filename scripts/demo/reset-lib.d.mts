export const DATA_FILE: string;
export function resetTargets(home: string): string[];
export function resetData(opts: { home: string; yes: boolean; log: (line: string) => void }): { found: string[]; deleted: string[] };
