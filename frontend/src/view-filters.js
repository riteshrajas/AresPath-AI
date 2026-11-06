import { createFilterRegistry } from './filter-registry.js';
import { formatCoordinates } from './coordinates.js';
import './view-filters.css';

const groups = [
  { id: 'overlays', label: 'Map overlays', description: 'Information on top of your view.' },
  { id: 'effects', label: 'Visual effects', description: 'Tune the display without changing terrain data.' },
  { id: 'places', label: 'Places', description: 'Search official Mars landmarks and fly to their centers.' },
];

// Add effects here, or register one through the returned registry. apply runs
// on preference changes; update is reserved for overlays and arriving meshes.
export function createViewFilters({ renderer, getMeshes, getFocus, places }) {
  let storage;
  try { storage = localStorage; } catch { /* Preferences remain session-only. */ }
  const registry = createFilterRegistry({ storage });
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'turbo-toggle filters-trigger';
  trigger.textContent = 'Filters'; trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'filters-panel');
  document.querySelector('header').appendChild(trigger);
  const panel = document.createElement('section'); panel.id = 'filters-panel'; panel.className = 'filters-panel';
  panel.hidden = true; panel.setAttribute('aria-label', 'Filters');
  panel.innerHTML = `<div class="filters-heading"><div><span class="filters-eyebrow">CUSTOMIZE YOUR VIEW</span><h2>Filters</h2></div><button type="button" class="filters-close" aria-label="Close filters">×</button></div><div class="filters-groups"></div><div class="filters-footer"><span>Display preferences save on this device.</span><button type="button" class="filters-reset">Reset filters</button></div>`;
  document.body.appendChild(panel);
  const crosshair = document.createElement('div'); crosshair.className = 'view-crosshair'; crosshair.hidden = true; crosshair.setAttribute('aria-hidden', 'true'); document.body.appendChild(crosshair);
  const readout = document.createElement('div'); readout.className = 'coordinate-readout'; readout.hidden = true;
  readout.innerHTML = '<span>VIEW CENTER · APPROX.</span><output>Waiting for terrain…</output>'; document.body.appendChild(readout);
  let lastReadout = -Infinity, contrast = 1, saturation = 1, wireframe = false;
  const materialStates = new WeakMap();
  const updateColor = () => { renderer.domElement.style.filter = contrast === 1 && saturation === 1 ? 'none' : `contrast(${contrast}) saturate(${saturation})`; };
  registry.register({ id: 'coordinates', group: 'overlays', type: 'toggle', label: 'Show coordinates', description: 'Approximate latitude and longitude at the center of your view.', default: false,
    apply: value => { readout.hidden = !value; lastReadout = -Infinity; } });
  registry.register({ id: 'crosshair', group: 'overlays', type: 'toggle', label: 'Center crosshair', description: 'A reference point for aiming and coordinates.', default: false, apply: value => { crosshair.hidden = !value; } });
  registry.register({ id: 'exposure', type: 'range', label: 'Exposure', description: 'Brightness of the rendered scene.', default: 1.05, min: .4, max: 2, step: .05, format: value => `${value.toFixed(2)}×`, apply: value => { renderer.toneMappingExposure = value; } });
  registry.register({ id: 'contrast', type: 'range', label: 'Contrast', default: 1, min: .5, max: 1.5, step: .05, format: value => `${Math.round(value * 100)}%`, apply: value => { contrast = value; updateColor(); } });
  registry.register({ id: 'saturation', type: 'range', label: 'Saturation', default: 1, min: 0, max: 2, step: .05, format: value => `${Math.round(value * 100)}%`, apply: value => { saturation = value; updateColor(); } });
  registry.register({ id: 'wireframe', type: 'toggle', label: 'Terrain wireframe', description: 'Inspect the actual mesh, including newly loaded tiles.', default: false, apply: value => { wireframe = value; } });
  registry.register({ id: 'places', group: 'places', type: 'toggle', label: 'Place labels', description: 'Official landmark labels, scaled to your view.', default: true, apply: value => places?.setEnabled(value) });
  registry.register({ id: 'saved-places', group: 'places', type: 'toggle', label: 'Saved locations', description: 'Bookmarks and custom pins will go here.', default: false, disabled: true, badge: 'Planned' });

  const fields = new Map();
  function render() {
    const list = registry.list();
    // Rebuild only when registration changes, never while dragging a slider.
    if (fields.size !== list.length) {
      fields.clear(); const container = panel.querySelector('.filters-groups'); container.replaceChildren();
      const customGroups = [...groups];
      for (const item of list) if (!customGroups.some(group => group.id === item.group)) customGroups.push({ id: item.group, label: item.group });
      for (const group of customGroups) {
        const section = document.createElement('section'); section.className = 'filter-group';
        const heading = document.createElement('h3'); heading.textContent = group.label; section.appendChild(heading);
        if (group.description) { const description = document.createElement('p'); description.className = 'filter-group-description'; description.textContent = group.description; section.appendChild(description); }
        for (const item of list.filter(filter => filter.group === group.id)) {
          const row = document.createElement('div'); row.className = `filter-row ${item.type === 'range' ? 'filter-range' : ''}`;
          const label = document.createElement('label'); label.htmlFor = `filter-${item.id}`; label.textContent = item.label;
          const input = document.createElement('input'); input.id = label.htmlFor; input.disabled = !!item.disabled;
          input.type = item.type === 'toggle' ? 'checkbox' : 'range';
          const output = document.createElement('output'); output.htmlFor = input.id;
          if (item.type === 'range') { input.min = item.min; input.max = item.max; input.step = item.step; }
          input.addEventListener('input', () => registry.set(item.id, item.type === 'toggle' ? input.checked : Number(input.value)));
          row.append(label);
          if (item.badge) { const badge = document.createElement('span'); badge.className = 'filter-badge'; badge.textContent = item.badge; row.appendChild(badge); }
          if (item.type === 'range') row.appendChild(output);
          row.appendChild(input);
          if (item.description) {
            const description = document.createElement('p'); description.id = `${input.id}-description`; description.textContent = item.description;
            input.setAttribute('aria-describedby', description.id); row.appendChild(description);
          }
          section.appendChild(row); fields.set(item.id, { input, output });
        }
        if (group.id === 'places' && places) section.appendChild(places.element);
        container.appendChild(section);
      }
    }
    for (const item of list) {
      const { input, output } = fields.get(item.id);
      if (item.type === 'toggle') input.checked = item.value;
      else { input.value = item.value; output.value = item.format?.(item.value) || String(item.value); input.setAttribute('aria-valuetext', output.value); }
    }
  }
  registry.subscribe(render); render();
  function setOpen(open, restoreFocus = false) {
    panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('.filters-close').focus();
    if (!open && restoreFocus) trigger.focus();
  }
  trigger.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('.filters-close').addEventListener('click', () => setOpen(false, true));
  panel.querySelector('.filters-reset').addEventListener('click', () => registry.reset());
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false, true); } });
  panel.addEventListener('place-selected', () => setOpen(true));
  return { registry, update(now) {
    // Only visit the three terrain meshes; don't walk the sky or entire scene.
    for (const mesh of getMeshes()) if (mesh) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (materialStates.get(material) !== wireframe) { material.wireframe = wireframe; material.needsUpdate = true; materialStates.set(material, wireframe); }
      }
    }
    if (registry.get('coordinates') && now - lastReadout >= 200) {
      readout.querySelector('output').value = formatCoordinates(getFocus()); lastReadout = now;
    }
  } };
}
