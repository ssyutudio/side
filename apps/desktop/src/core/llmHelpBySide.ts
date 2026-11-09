// "By your side": one sentence about which steps got this person going, from their own counts
// only. Below three opened steps sidy says it is still learning (no LLM call). After that Claude
// may phrase the sentence from the numbers alone; a sentence with a number it was not given,
// advice, a link or more than one line is rejected and the rule sentence is used.
import type { SideNumbers } from './stats';
import type { LlmRequest } from './llmHelp';

export const LEARN_AFTER = 3;
const ADVICE = /\b(should|must|need to|try to|sleep|health|diagnos|adhd|anxiety|depress|therapy)\b/i;

export interface BySideCounts {
  shown: number;
  opened: number;
  judged: number;
  kept: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function bySideCounts(n: SideNumbers): BySideCounts {
  return {
    shown: n.shown,
    opened: n.clicked,
    judged: n.stillWorkingRate.n,
    kept: Math.round((n.stillWorkingRate.value ?? 0) * n.stillWorkingRate.n),
  };
}

export function bySideKey(c: BySideCounts): string {
  return `${c.shown}/${c.opened}/${c.judged}/${c.kept}`;
}

export function ruleBySide(n: SideNumbers): string {
  const c = bySideCounts(n);
  if (c.opened < LEARN_AFTER) {
    return `sidy is still learning what gets you started. ${plural(c.opened, 'step')} opened so far — after ${LEARN_AFTER}, it can tell you which kind works for you.`;
  }
  if (c.judged === 0) return `${plural(c.opened, 'step')} opened so far. sidy checks 10 minutes after each one whether you kept going.`;
  return `Of ${plural(c.judged, 'step')} you opened and stayed with long enough to tell, ${c.kept} kept you going past 10 minutes.`;
}

export function buildBySideRequest(c: BySideCounts): LlmRequest {
  return {
    system:
      'Write ONE short, plain English sentence (under 160 characters) telling a person what their own numbers say about ' +
      'the small steps that got them started. Use only the numbers given. No advice, no praise words, nothing about sleep or health. ' +
      'Reply with the sentence only.',
    user: `Steps shown: ${c.shown}\nSteps opened: ${c.opened}\nOpened steps checked at 10 minutes: ${c.judged}\nStill working at 10 minutes: ${c.kept}`,
  };
}

export function parseBySide(text: string, c: BySideCounts): string | null {
  const s = text.trim().replace(/^["“]|["”]$/g, '').trim();
  if (!s || s.length > 200 || /\n/.test(s) || !/[.]$/.test(s)) return null;
  if (/https?:|www\.|\.com\b/i.test(s) || ADVICE.test(s)) return null;
  if ((s.match(/[.!?](\s|$)/g) ?? []).length > 1) return null;
  const allowed = new Set([c.shown, c.opened, c.judged, c.kept, 10].map(String));
  for (const num of s.match(/\d+/g) ?? []) if (!allowed.has(num)) return null;
  return s;
}
