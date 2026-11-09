import { FIXTURES } from '../shared/fixtures';
import { bubbleClass, bubbleView, edgeView, toastView } from './edgeView';

const day = FIXTURES.day;
const s = (x: unknown) => String(x);
const fills = (h: string) => (h.match(/class="btn fill/g) ?? []).length;

describe('bubbleView', () => {
  it('offers the one step with Step inside and Rest today at equal size, and × as Not now', () => {
    const h = s(bubbleView({ kind: 'step', stepId: 'st1', trigger: 'app_start' }, day));
    expect(h).toContain('Pricing page is ready where you stopped.');
    expect(h).toContain('Last wrap-up · Yesterday');
    expect(h).toMatch(/btn fill grow"[^>]*data-act="step-open"/);
    expect(h).toMatch(/btn grow"[^>]*data-act="rest-today"/);
    expect(h).toContain('aria-label="Not now"');
    expect(fills(h)).toBe(1);
  });

  it('welcomes back after a gap with the real date and no count of days', () => {
    const h = s(bubbleView({ kind: 'step', stepId: 'st1', trigger: 'app_start' }, FIXTURES['three-days']));
    expect(h).toContain('Welcome back.');
    expect(h).toContain('Last wrap-up · Mon, Nov 9');
    expect(h).not.toMatch(/\d+ days|missed|overdue/i);
  });

  it('says nothing for a step that is no longer current', () => {
    expect(bubbleView({ kind: 'step', stepId: 'old', trigger: 'wake' }, day)).toBeNull();
  });

  it('opens the first run with what it saw in the real tabs', () => {
    const h = s(bubbleView({ kind: 'first_run', tabs: 38, groups: 3 }, day));
    expect(h).toContain("Hi, I'm sidy. I can see 38 tabs — about 3 kinds of work.");
    expect(h).toContain('data-act="show-me"');
    expect(fills(h)).toBe(1);
  });

  it('asks once at the chosen time with three choices', () => {
    const h = s(bubbleView({ kind: 'promise', promiseId: 'p1', minutes: 30 }, day));
    expect(h).toContain('The 30 minutes you asked for are up. Set today aside?');
    for (const a of ['set_aside', 'keep_going', 'not_today']) expect(h).toContain(`data-answer="${a}"`);
    expect(s(bubbleView({ kind: 'promise', promiseId: 'p1', minutes: 60 }, day))).toContain('The hour you asked for is up.');
  });

  it('draws the three-button check-in wider so Not today stays inside the bubble (approved size)', () => {
    expect(bubbleClass({ kind: 'promise', promiseId: 'p1', minutes: 30 })).toBe('bubble wide');
    expect(bubbleClass({ kind: 'step', stepId: 'st1', trigger: 'app_start' })).toBe('bubble');
    expect(bubbleClass({ kind: 'first_run', tabs: 38, groups: 3 })).toBe('bubble');
  });

  it('escapes text that comes from tab titles or the user', () => {
    const evil = { ...day, step: { ...day.step!, label: '<script>x</script>' } };
    expect(s(bubbleView({ kind: 'step', stepId: 'st1', trigger: 'app_start' }, evil))).not.toContain('<script>');
  });
});

describe('edgeView', () => {
  it('tucks sidy in so only the eyes show when quiet, and leans out when talking', () => {
    const quiet = s(edgeView({ mode: 'quiet', size: 40, hitY: 90, hitSize: 48 }));
    // Not the class name .quiet: that is Main's grey box and drew a panel behind sidy.
    expect(quiet).toContain('class="edge tucked"');
    expect(quiet).toContain('--q:21px');
    expect(quiet).toContain('--o:3px');
    expect(s(edgeView({ mode: 'out', size: 64, hitY: 90, hitSize: 72 }))).toContain('class="edge out"');
  });

  it('draws nothing at all when hidden', () => {
    expect(s(edgeView({ mode: 'hidden', size: 40, hitY: 90, hitSize: 48 }))).toBe('');
  });
});

describe('toastView', () => {
  it('offers Bring back on the hidden toast', () => {
    const h = s(toastView({ text: 'x', ms: 6000, kind: 'hidden' }));
    expect(h).toContain('sidy is hidden.');
    expect(h).toContain('data-act="bring-back"');
  });
});
