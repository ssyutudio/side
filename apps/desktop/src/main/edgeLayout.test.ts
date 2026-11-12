import { anchorAt, DEFAULT_ANCHOR, edgeLayout } from './edgeLayout';

const mba = { x: 0, y: 25, width: 1710, height: 1082 }; // 15" MacBook Air work area below the menu bar

describe('edgeLayout', () => {
  it('pins the window to the right edge of the work area', () => {
    const l = edgeLayout(mba, 'small');
    expect(l.window.x + l.window.width).toBe(mba.x + mba.width);
    expect(l.window.y).toBeGreaterThanOrEqual(mba.y);
    expect(l.window.y + l.window.height).toBeLessThanOrEqual(mba.y + mba.height);
  });

  it('uses the configured visible height for sidy and a hit area of at least 44pt', () => {
    expect(edgeLayout(mba, 'small').sidyHeight).toBe(40);
    expect(edgeLayout(mba, 'large').sidyHeight).toBe(64);
    for (const size of ['small', 'medium', 'large'] as const) {
      const hit = edgeLayout(mba, size).hit;
      expect(hit.width).toBeGreaterThanOrEqual(44);
      expect(hit.height).toBeGreaterThanOrEqual(44);
    }
  });

  it('keeps the hit area inside the window and touching the right edge', () => {
    const l = edgeLayout(mba, 'medium');
    expect(l.hit.x + l.hit.width).toBe(l.window.width);
    expect(l.hit.y).toBeGreaterThanOrEqual(0);
    expect(l.hit.y + l.hit.height).toBeLessThanOrEqual(l.window.height);
  });

  it('leaves room on the left for a speech bubble', () => {
    const l = edgeLayout(mba, 'large');
    expect(l.window.width - l.hit.width).toBeGreaterThanOrEqual(300);
  });

  it('works on a display that is not at the origin', () => {
    const ext = { x: 1710, y: 0, width: 2560, height: 1415 };
    const l = edgeLayout(ext, 'small');
    expect(l.window.x + l.window.width).toBe(ext.x + ext.width);
  });

  it('moves sidy along the edge to where it was dragged, and back from the anchor it remembers', () => {
    const l = edgeLayout(mba, 'small', anchorAt(mba, 300));
    expect(l.window.y + l.hit.y + l.hit.height / 2).toBe(300);
    expect(anchorAt(mba, l.window.y + l.hit.y + l.hit.height / 2)).toBeCloseTo((300 - mba.y) / mba.height);
  });

  it('keeps sidy whole on screen at the very top and bottom: the window stops, sidy moves inside it', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      for (const anchor of [0, 1, -3, 7]) {
        const l = edgeLayout(mba, size, anchor);
        expect(l.window.y).toBeGreaterThanOrEqual(mba.y);
        expect(l.window.y + l.window.height).toBeLessThanOrEqual(mba.y + mba.height);
        expect(l.hit.y).toBeGreaterThanOrEqual(0);
        expect(l.hit.y + l.hit.height).toBeLessThanOrEqual(l.window.height);
      }
    }
    const top = edgeLayout(mba, 'small', 0);
    expect(top.window.y + top.hit.y).toBe(mba.y);
    const bottom = edgeLayout(mba, 'small', 1);
    expect(bottom.window.y + bottom.hit.y + bottom.hit.height).toBe(mba.y + mba.height);
  });

  it('falls back to the default spot for a junk anchor and clamps a point off the screen', () => {
    expect(edgeLayout(mba, 'small', Number.NaN)).toEqual(edgeLayout(mba, 'small'));
    expect(edgeLayout(mba, 'small')).toEqual(edgeLayout(mba, 'small', DEFAULT_ANCHOR));
    expect(anchorAt(mba, -500)).toBe(0);
    expect(anchorAt(mba, 99999)).toBe(1);
  });
});
