import { edgeLayout } from './edgeLayout';

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
});
