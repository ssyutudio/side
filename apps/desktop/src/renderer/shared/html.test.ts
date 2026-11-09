import { html, raw, attr } from './html';
import { sidySvg } from './sidy';

describe('html', () => {
  it('escapes interpolated text so page titles cannot inject markup', () => {
    const title = '<img src=x onerror=alert(1)> & "quotes"';
    expect(String(html`<p>${title}</p>`)).toBe('<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;</p>');
  });

  it('joins arrays and keeps raw fragments as they are', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    expect(String(html`<ul>${items}</ul>`)).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(String(html`<div>${raw('<b>ok</b>')}</div>`)).toBe('<div><b>ok</b></div>');
  });

  it('drops null, undefined and false', () => {
    expect(String(html`<i>${null}${undefined}${false}</i>`)).toBe('<i></i>');
  });

  it('builds attribute strings safely', () => {
    expect(String(attr({ 'aria-pressed': true, disabled: false, 'data-key': 'a"b' }))).toBe(' aria-pressed="true" data-key="a&quot;b"');
  });
});

describe('sidySvg', () => {
  it('draws one rounded square, a blue side and two eyes, at the requested size', () => {
    const svg = sidySvg(40);
    expect(svg).toContain('width="40" height="40"');
    expect(svg).toContain('#3B54E7');
    expect(svg.match(/rx="4"/g)).toHaveLength(2);
    expect(svg).not.toMatch(/gradient|circle/i);
  });
});
