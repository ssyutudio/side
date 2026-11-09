export const DEMO_HOSTS: string[];
export function loadDemoTabs(file?: string): { work: string; url: string }[];
export function demoUrls(tabs: { work: string; url: string }[], docsUrl?: string): string[];
export function openArgs(urls: string[]): string[];
