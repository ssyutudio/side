// Local JSON store. Writes go to a temp file, then rename, so a crash never leaves half a file.
// Failure points: read (only ENOENT means "no file"), parse (corrupt file is moved aside, never
// deleted), temp write and rename (original stays as it was; the error reaches the caller).
import * as nodeFs from 'node:fs/promises';
import { dirname } from 'node:path';

export type FsLike = Pick<typeof nodeFs, 'readFile' | 'writeFile' | 'rename' | 'rm' | 'mkdir'>;

export type LoadState = 'not_loaded' | 'fresh' | 'loaded' | 'recovered' | 'unreadable';

export class StoreReadError extends Error {}

export class JsonStore<T extends object> {
  private data: T;
  private queue: Promise<unknown> = Promise.resolve();
  loadState: LoadState = 'not_loaded';
  /** Path of the corrupt file that was moved aside, if any. */
  movedAside: string | null = null;

  constructor(
    readonly path: string,
    private readonly defaults: () => T,
    private readonly fs: FsLike = nodeFs,
  ) {
    this.data = defaults();
  }

  get(): T {
    return this.data;
  }

  async load(): Promise<T> {
    let text: string;
    try {
      text = await this.fs.readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.data = this.defaults();
        this.loadState = 'fresh';
        return this.data;
      }
      // The file exists but cannot be read: keep defaults in memory and refuse to overwrite it.
      this.data = this.defaults();
      this.loadState = 'unreadable';
      return this.data;
    }
    try {
      const parsed = JSON.parse(text) as Partial<T>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      this.data = { ...this.defaults(), ...parsed };
      this.loadState = 'loaded';
    } catch {
      const aside = `${this.path}.corrupt-${Date.now()}`;
      await this.fs.rename(this.path, aside);
      this.movedAside = aside;
      this.data = this.defaults();
      this.loadState = 'recovered';
    }
    return this.data;
  }

  /** Applies fn to the current data and persists it. Updates run one at a time, in call order. */
  update(fn: (d: T) => T): Promise<T> {
    const run = this.queue.then(() => this.write(fn(this.data)));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(next: T): Promise<T> {
    if (this.loadState === 'unreadable') {
      throw new StoreReadError('Side could not read its data file, so it will not overwrite it.');
    }
    const tmp = this.path + '.tmp';
    await this.fs.mkdir(dirname(this.path), { recursive: true });
    try {
      await this.fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
      await this.fs.rename(tmp, this.path);
    } catch (err) {
      await this.fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
    this.data = next;
    return next;
  }
}
