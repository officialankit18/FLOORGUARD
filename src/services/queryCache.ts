export interface QuerySnapshot<T> {
  data: T | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

// Session memory keeps route changes instant without persisting private photos.
export class QueryResource<T> {
  private snapshot: QuerySnapshot<T> = { data: undefined, isLoading: true, isRefreshing: false, error: null };
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private updatedAt = 0;
  private revision = 0;
  constructor(private loader: () => Promise<T>, private staleTime = 60_000) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit(next: QuerySnapshot<T>) {
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }
  update(updater: (data: T | undefined) => T | undefined) {
    this.revision++;
    const data = updater(this.snapshot.data);
    if (data !== undefined) this.emit({ ...this.snapshot, data, isLoading: false });
  }
  invalidate() { this.updatedAt = 0; }
  load = (force = false): Promise<void> => {
    if (this.pending) return this.pending;
    if (!force && this.snapshot.data !== undefined && Date.now() - this.updatedAt < this.staleTime) return Promise.resolve();
    const revision = this.revision;
    this.emit({ ...this.snapshot, isLoading: this.snapshot.data === undefined, isRefreshing: true, error: null });
    this.pending = this.loader().then(data => {
      if (revision === this.revision) {
        this.updatedAt = Date.now();
        this.emit({ data, isLoading: false, isRefreshing: false, error: null });
      }
    }).catch(error => {
      this.emit({ ...this.snapshot, error: error instanceof Error ? error.message : 'Unable to load data.' });
    }).finally(() => {
      this.pending = null;
      this.emit({ ...this.snapshot, isLoading: false, isRefreshing: false });
      if (revision !== this.revision && this.snapshot.data === undefined) void this.load(true);
    });
    return this.pending;
  };
}
