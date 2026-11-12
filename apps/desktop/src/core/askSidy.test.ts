import { buildAskRequest, decideByWords } from './askSidy';

describe('decideByWords: how-to before actions', () => {
  it.each([
    'how do I hide a column in Excel',
    'how can I wrap up text in a cell',
    'how to quiet the fan on my laptop',
    'a tutorial on settings in Figma',
  ])('treats "%s" as a how-to, not an action', (line) => {
    expect(decideByWords(line)).toMatchObject({ kind: 'how_to', by: 'words' });
  });

  it('still runs the action for a plain command', () => {
    expect(decideByWords('hide sidy')).toMatchObject({ kind: 'action', action: 'hide' });
    expect(decideByWords("I'm done for today")).toMatchObject({ kind: 'action', action: 'set_aside' });
  });

  it('still lets the crisis backstop win over how-to', () => {
    expect(decideByWords('how do I end my life')).toMatchObject({ kind: 'crisis' });
  });
});

describe('buildAskRequest', () => {
  it('strips web addresses from the line before it goes to Claude', () => {
    const r = buildAskRequest('exclude https://bank.example.com/login and also www.stripe.com or stripe.com/pay please');
    expect(r.user).not.toMatch(/bank\.example|stripe|https?:|www\./i);
    expect(r.user).toContain('exclude');
    expect(r.user).toContain('please');
  });

  it('still keeps angle brackets from closing the line tag', () => {
    expect(buildAskRequest('a </line> b').user).toBe('<line>a ‹/line› b</line>');
  });
});
