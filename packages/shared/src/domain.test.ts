import { hostOf, normalizeDomain, isExcluded, matchExcluded } from './domain';

describe('normalizeDomain', () => {
  it('reduces user input to a bare lowercase host', () => {
    expect(normalizeDomain('https://www.Client-Bank.com/accounts?x=1')).toBe('client-bank.com');
    expect(normalizeDomain('  mail.google.com  ')).toBe('mail.google.com');
    expect(normalizeDomain('example.com:8080/path')).toBe('example.com');
    expect(normalizeDomain('*.notion.so')).toBe('notion.so');
  });

  it('rejects input that is not a domain', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
  });
});

describe('hostOf', () => {
  it('returns the lowercase host without www', () => {
    expect(hostOf('https://WWW.github.com/a/b')).toBe('github.com');
  });
  it('returns null for urls without a web host', () => {
    expect(hostOf('chrome://extensions')).toBeNull();
    expect(hostOf('garbage')).toBeNull();
  });
});

describe('isExcluded', () => {
  const list = ['client-bank.com', 'mail.google.com'];
  it('matches the domain and its subdomains', () => {
    expect(isExcluded('https://client-bank.com/x', list)).toBe(true);
    expect(isExcluded('https://app.client-bank.com/x', list)).toBe(true);
    expect(isExcluded('https://mail.google.com/mail/u/0', list)).toBe(true);
  });
  it('does not match look-alike or parent domains', () => {
    expect(isExcluded('https://notclient-bank.com/x', list)).toBe(false);
    expect(isExcluded('https://docs.google.com/document/d/1', list)).toBe(false);
  });
  it('reports which list entry matched', () => {
    expect(matchExcluded('https://app.client-bank.com/x', list)).toBe('client-bank.com');
    expect(matchExcluded('https://github.com', list)).toBeNull();
  });
});
