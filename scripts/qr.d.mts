export function checkQrUrl(input: string): string;
export function makeQr(url: string, outDir: string): Promise<{ url: string; png: string; svg: string }>;
