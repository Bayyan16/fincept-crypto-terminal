/**
 * Drop-in bounded LRU-like Map that evicts the oldest entries once `maxSize` is exceeded,
 * preventing unbounded memory growth across long-running backend gateway uptime.
 */
export class BoundedMap extends Map {
  constructor(maxSize = 500) {
    super();
    this.maxSize = Math.max(1, Number(maxSize) || 500);
  }

  set(key, value) {
    if (this.has(key)) {
      this.delete(key);
    } else if (this.size >= this.maxSize) {
      const oldestKey = this.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
      }
    }
    return super.set(key, value);
  }
}
