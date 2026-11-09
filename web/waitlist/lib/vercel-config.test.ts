import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('vercel deploy layout', () => {
  it('keeps only function entry points in api/', () => {
    const files = readdirSync(join(ROOT, 'api'));
    expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
    expect(files.sort()).toEqual(['join.ts', 'usage.ts']);
  });

  it('has a valid vercel.json that covers the api functions', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    expect(Object.keys(cfg.functions)).toContain('api/*.ts');
  });

  it('runs functions as ES modules, because postgres v4 cannot be required from CommonJS', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies.postgres).toBeTruthy();
  });

  it('gives every runtime relative import a .js extension, as Node ESM requires', () => {
    const runtime = [
      ...readdirSync(join(ROOT, 'api')).map((f) => join('api', f)),
      ...readdirSync(join(ROOT, 'lib')).filter((f) => !f.endsWith('.test.ts') && f !== 'testing.ts').map((f) => join('lib', f)),
    ];
    const bare: string[] = [];
    for (const f of runtime) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
        if (!m[1].endsWith('.js')) bare.push(`${f}: ${m[1]}`);
      }
    }
    expect(bare).toEqual([]);
  });
});
