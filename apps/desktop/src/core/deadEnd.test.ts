import { isDeadEnd } from './deadEnd';

describe('isDeadEnd', () => {
  it.each([
    ['http://localhost:3000/', 'localhost'],
    ['http://127.0.0.1:8080/api', 'API'],
    ['https://accounts.google.com/v3/signin/identifier?continue=x', 'Sign in - Google Accounts'],
    ['https://www.overleaf.com/login', 'Log in to Overleaf'],
    ['https://www.notion.so/login', 'Notion'],
    ['https://stackoverflow.com/questions/tagged/kafka', 'Just a moment...'],
    ['https://www.reddit.com/r/GradSchool/', 'Reddit - Prove your humanity'],
    ['https://map.example.com/p/', 'map.example.com/p/'],
    ['https://shop.example.com/', 'shop.example.com'],
    ['not a url', 'x'],
  ])('%s (%s) is not a step', (url, title) => {
    expect(isDeadEnd({ url, title })).toBe(true);
  });

  it.each([
    ['https://kafka.apache.org/documentation/', 'Apache Kafka Documentation'],
    ['https://en.wikipedia.org/wiki/Attention_(machine_learning)', 'Attention (machine learning) - Wikipedia'],
    ['https://github.com/apache/kafka/pulls', 'Pull requests · apache/kafka'],
    ['https://www.naver.com/', 'NAVER'],
    ['https://docs.google.com/document/d/abc/edit', 'Thesis draft - Google Docs'],
  ])('%s (%s) can be a step', (url, title) => {
    expect(isDeadEnd({ url, title })).toBe(false);
  });
});
