import { allowView, startAllowPage } from './allow';
import { resetLanguage, setLanguage } from './lang';
import { EVERY_SITE } from './api';

function fakeRoot() {
  let click: (() => void) | null = null;
  const root = {
    innerHTML: '',
    querySelector: (s: string) => (s === '#allow' && root.innerHTML.includes('id="allow"') ? { addEventListener: (_t: string, f: () => void) => (click = f) } : null),
    click: () => click?.(),
  };
  return root;
}
const api = { storage: { local: { get: async () => ({}) } } } as any;

describe('allow page', () => {
  afterEach(() => resetLanguage());

  it('explains what is read and asks for every site with one button', () => {
    const h = allowView('ask');
    expect(h).toContain('only how far down you were and one visible sentence');
    expect(h).toContain('id="allow"');
  });

  it('asks Chrome for every site on the click, then says it is done', async () => {
    const asked: string[][] = [];
    const root = fakeRoot();
    await startAllowPage(api, { contains: async () => false, request: async (p) => (asked.push(p.origins), true) }, root);
    root.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([EVERY_SITE]);
    expect(root.innerHTML).toContain('Done.');
    expect(root.innerHTML).not.toContain('id="allow"');
  });

  it('says so when the person says no, and keeps the button', async () => {
    const root = fakeRoot();
    await startAllowPage(api, { contains: async () => false, request: async () => false }, root);
    root.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.innerHTML).toContain('Not allowed.');
    expect(root.innerHTML).toContain('id="allow"');
  });

  it('is in Korean when the app said Korean', () => {
    setLanguage('ko');
    expect(allowView('ask')).not.toMatch(/Allow on every site/);
  });
});
