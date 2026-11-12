// Every key the app passes to t(), tn() or k() has Korean, with the same {placeholders}, and the
// Korean dictionaries hold nothing the app no longer says.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { KO, KO_PARTS } from './ko';
import { k, language, says, setLanguage, t, tn } from './index';

const SRC = join(__dirname, '..');

function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (full !== __dirname) sources(full, found);
    } else if (/\.(ts|mjs)$/.test(name) && !/\.test\.|\.d\.m?ts$/.test(name)) found.push(full);
  }
  return found;
}

// A string literal ('...', "..." or `...` without ${}) right after t( , tn(<n>, , or k( .
const LIT = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\x60(?:[^\x60\\$]|\\.)*\x60)`;
const CALLS = [
  new RegExp(String.raw`(?<![\w.$])t\(\s*` + LIT, 'g'),
  new RegExp(String.raw`(?<![\w.$])k\(\s*` + LIT, 'g'),
  new RegExp(String.raw`(?<![\w.$])tn\([^,()]+(?:\([^()]*\))?[^,()]*,\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g'),
];
const unquote = (lit: string) => (0, eval)(lit) as string;

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const re of CALLS) {
      for (const m of text.matchAll(re)) {
        for (const lit of m.slice(1)) if (lit) keys.set(unquote(lit), relative(SRC, file));
      }
    }
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('t / tn / k', () => {
  afterEach(() => setLanguage('en'));

  it('says English by default and Korean once picked, filling {values}', () => {
    expect(language()).toBe('en');
    expect(t('{n} tabs', { n: 3 })).toBe('3 tabs');
    expect(tn(1, '{n} tab', '{n} tabs')).toBe('1 tab');
    expect(tn(2, '{n} tab', '{n} tabs')).toBe('2 tabs');
    expect(k('Small')).toBe('Small');
    setLanguage('ko');
    expect(t('a sentence nobody translated')).toBe('a sentence nobody translated');
    setLanguage('xx' as never);
    expect(language()).toBe('en');
  });
});

describe('says', () => {
  afterEach(() => setLanguage('en'));
  it('recognizes a stored sentence in either language, whatever the screen says now', () => {
    const key = 'Set aside {tabs} in {groups}.';
    expect(says('Set aside 3 tabs in 1 group.', key)).toBe(true);
    setLanguage('ko');
    const korean = t(key, { tabs: tn(3, '{n} tab', '{n} tabs'), groups: tn(1, '{n} group', '{n} groups') });
    setLanguage('en');
    expect(says(korean, key)).toBe(true);
    expect(says('Came back to Pricing (3 tabs).', key)).toBe(false);
  });
});

describe('Korean dictionary', () => {
  const used = usedKeys();

  it('translates every key the app uses', () => {
    const missing = [...used].filter(([key]) => !(key in KO)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('keeps the same {placeholders} as the English', () => {
    const wrong = Object.entries(KO).filter(([en, ko]) => placeholders(en) !== placeholders(ko)).map(([en]) => en);
    expect(wrong).toEqual([]);
  });

  it('holds no key the app no longer uses', () => {
    expect(Object.keys(KO).filter((key) => !used.has(key))).toEqual([]);
  });

  it('keeps the side wordplay names in English on Korean screens (Director: they are the fun part)', () => {
    for (const name of ['Set aside', 'Set aside today', 'Set today aside', 'Step inside', 'Stepped inside', 'By your side', 'Set up Side', 'Open Side', 'What Side saw']) {
      expect(KO[name]).toBe(name);
    }
  });

  it('gives a key shared by two parts the same Korean', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const part of Object.values(KO_PARTS)) {
      for (const [en, ko] of Object.entries(part)) {
        if (seen.has(en) && seen.get(en) !== ko) clashes.push(en);
        seen.set(en, ko);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('never builds a key from ${} (it could not be translated)', () => {
    const bad: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (/(?<![\w.$])(t|k)\(\s*`[^`]*\$\{/.test(text) || /(?<![\w.$])tn\([^`]*?,\s*`[^`]*\$\{/.test(text)) bad.push(relative(SRC, file));
    }
    expect(bad).toEqual([]);
  });
});
