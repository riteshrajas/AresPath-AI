export function pointToTile(longitude, latitude, z) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isInteger(z)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90 || z < 0 || z > 18)
    throw Error('Enter valid Mars longitude, latitude, and detail level (0–18).');
  const n = 2 ** z;
  return { z, x: Math.min(n - 1, Math.floor((longitude + 180) / 360 * n)),
    y: Math.min(n - 1, Math.floor((90 - latitude) / 180 * n)) };
}

export class TerrainClient {
  constructor(base = '', request = (...args) => globalThis.fetch(...args)) {
    this.base = base.replace(/\/$/, '');
    this.request = request;
    this.cache = new Map();
  }
  async json(path, signal) {
    const response = await this.request(this.base + path, { signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Error(typeof body.detail === 'string' ? body.detail : `Terrain API returned HTTP ${response.status}`);
    }
    return response.json();
  }
  coverage(longitude, latitude, signal) {
    return this.json(`/api/v1/coverage?longitude=${longitude}&latitude=${latitude}`, signal);
  }
  async tile(z, x, y, size = 65, signal) {
    const path = `/api/v1/tiles/${z}/${x}/${y}?size=${size}`;
    if (signal?.aborted) throw new DOMException('Request canceled', 'AbortError');
    if (this.cache.has(path)) {
      const value = this.cache.get(path);
      this.cache.delete(path); this.cache.set(path, value);
      return value;
    }
    const value = await this.json(path, signal);
    if (signal?.aborted) throw new DOMException('Request canceled', 'AbortError');
    this.cache.set(path, value);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value);
    return value;
  }
}
