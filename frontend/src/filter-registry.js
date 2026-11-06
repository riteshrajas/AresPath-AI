// Filters declare their UI and behavior in one place. Storage is optional so
// the viewer still works in private browsing or with unavailable localStorage.
export function createFilterRegistry({ storage, key = 'arespath.filters.v1' } = {}) {
  const definitions = new Map(), values = new Map(), listeners = new Set();
  let saved = {};
  try {
    const parsed = JSON.parse(storage?.getItem(key) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch { /* Invalid or inaccessible preferences use defaults. */ }
  const publish = () => { for (const listener of listeners) listener(); };
  function normalize(definition, value) {
    if (definition.type === 'toggle') return typeof value === 'boolean' ? value : definition.default;
    if (typeof value !== 'number' || !Number.isFinite(value)) value = definition.default;
    const clamped = Math.min(definition.max, Math.max(definition.min, value));
    const snapped = definition.min + Math.round((clamped - definition.min) / definition.step) * definition.step;
    return Number(Math.min(definition.max, Math.max(definition.min, snapped)).toFixed(8));
  }
  function persist() {
    try { storage?.setItem(key, JSON.stringify(Object.fromEntries(values))); } catch { /* Optional. */ }
  }
  const registry = {
    register(definition) {
      if (!definition.id || definitions.has(definition.id)) throw Error(`Duplicate or missing filter id: ${definition.id}`);
      if (!['toggle', 'range'].includes(definition.type)) throw Error(`Unsupported filter type: ${definition.type}`);
      if (definition.type === 'toggle' && typeof definition.default !== 'boolean') throw Error('Toggle default must be boolean');
      if (definition.type === 'range' && (!Number.isFinite(definition.min) || !Number.isFinite(definition.max)
        || !(definition.max > definition.min) || !Number.isFinite(definition.step) || !(definition.step > 0) || !Number.isFinite(definition.default))) throw Error('Invalid filter range');
      const item = Object.freeze({ group: 'effects', ...definition });
      definitions.set(item.id, item);
      const value = normalize(item, item.disabled ? item.default : saved[item.id] ?? item.default);
      values.set(item.id, value);
      item.apply?.(value);
      publish();
      return registry;
    },
    set(id, value) {
      const item = definitions.get(id);
      if (!item) throw Error(`Unknown filter: ${id}`);
      if (item.disabled) return;
      const next = normalize(item, value);
      if (Object.is(values.get(id), next)) return;
      item.apply?.(next);
      values.set(id, next); persist(); publish();
    },
    get: id => values.get(id),
    list: () => [...definitions.values()].map(definition => ({ ...definition, value: values.get(definition.id) })),
    reset() {
      for (const item of definitions.values()) if (!item.disabled) registry.set(item.id, item.default);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return registry;
}
