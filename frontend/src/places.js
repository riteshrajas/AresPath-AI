import * as THREE from 'three';
import { planetPoint, SCALE } from './globe-math.js';
import { formatCoordinates } from './coordinates.js';
import { PLACE_CATEGORIES, searchPlaces, spacedLabels, placeViewRange } from './places-data.js';
import './places.css';

export function createPlaces({ camera, getRadius, isReady, onSelect }) {
  const quick = document.createElement('form'); quick.className = 'location-search'; quick.setAttribute('role', 'search');
  quick.innerHTML = `<div class="location-search-bar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" aria-label="Search Mars locations" placeholder="Search Mars locations…" autocomplete="off" spellcheck="false"><button type="submit" class="location-go">Go ↗</button></div><div class="location-suggestions" hidden><p role="status"></p><div class="location-matches"></div></div>`;
  document.body.appendChild(quick);
  const quickInput = quick.querySelector('input'), suggestions = quick.querySelector('.location-suggestions');
  const quickStatus = suggestions.querySelector('p'), quickMatches = suggestions.querySelector('.location-matches');
  let quickResults = [], activeResult = 0;
  const element = document.createElement('div'); element.className = 'places-browser';
  element.innerHTML = `<label class="places-search-label" for="places-search">Find a landmark</label><input id="places-search" type="search" placeholder="Olympus Mons, Jezero…" autocomplete="off"><label class="places-search-label" for="places-category">Feature category</label><select id="places-category"></select><p class="places-status" role="status">Loading local landmark catalog…</p><button type="button" class="places-retry" hidden>Retry catalog</button><div class="places-results" aria-label="Landmark results"></div><article class="place-details" hidden></article><a class="places-credit" href="https://planetarynames.wr.usgs.gov/Page/MARS/target" target="_blank" rel="noopener noreferrer">IAU / USGS Gazetteer · NASA supported ↗</a>`;
  const search = element.querySelector('input'), category = element.querySelector('select');
  const status = element.querySelector('.places-status'), results = element.querySelector('.places-results');
  const details = element.querySelector('.place-details'), retry = element.querySelector('.places-retry');
  for (const [id, label] of Object.entries(PLACE_CATEGORIES)) { const option = document.createElement('option'); option.value = id; option.textContent = label; category.appendChild(option); }
  const overlay = document.createElement('div'); overlay.className = 'place-labels'; overlay.setAttribute('aria-label', 'Map landmarks'); document.body.appendChild(overlay);
  let features = [], matching = [], positions, enabled = true, selected, lastUpdate = -Infinity, loading = false;
  const screen = new THREE.Vector3(), direction = new THREE.Vector3();
  const pool = Array.from({ length: 22 }, () => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'place-label'; button.hidden = true;
    overlay.appendChild(button); return button;
  });
  function select(place, travel = true) {
    quickInput.value = place.name; quickResults = [place]; activeResult = 0; suggestions.hidden = true;
    selected = place; details.hidden = false; details.replaceChildren();
    const title = document.createElement('h4'); title.textContent = place.name; details.appendChild(title);
    for (const value of [place.type, formatCoordinates(place), `Catalog size: ${place.diameter_km.toLocaleString()} km`, 'Coordinates mark the feature center.']) {
      const line = document.createElement('p'); line.textContent = value; details.appendChild(line);
    }
    if (place.origin) { const origin = document.createElement('p'); origin.textContent = `Name origin: ${place.origin}`; details.appendChild(origin); }
    const link = document.createElement('a'); link.href = place.source_url; link.textContent = 'Official feature record ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.appendChild(link);
    const fly = document.createElement('button'); fly.type = 'button'; fly.textContent = 'Fly to center'; fly.addEventListener('click', () => onSelect(place, placeViewRange(place))); details.appendChild(fly);
    details.dispatchEvent(new Event('place-selected', { bubbles: true }));
    details.tabIndex = -1; details.focus({ preventScroll: true }); details.scrollIntoView({ block: 'nearest' });
    lastUpdate = -Infinity;
    if (travel) onSelect(place, placeViewRange(place));
  }
  function refreshQuick() {
    quickMatches.replaceChildren(); activeResult = 0;
    const query = quickInput.value.trim();
    suggestions.hidden = !query;
    quickResults = query ? searchPlaces(features, query).slice(0, 7) : [];
    quickStatus.textContent = loading ? 'Loading landmark catalog…' : !features.length ? 'Catalog unavailable. Retry in Filters → Places.' : quickResults.length ? 'Choose a location · Enter to fly' : 'No locations found. Try another name.';
    quickResults.forEach((place, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'location-match';
      const text = document.createElement('span'); const name = document.createElement('strong'); name.textContent = place.name;
      const subtitle = document.createElement('small'); subtitle.textContent = `${place.type} · ${formatCoordinates(place)}`;
      const go = document.createElement('span'); go.className = 'location-match-go'; go.textContent = 'Go ↗';
      text.append(name, subtitle); button.append(text, go);
      button.addEventListener('click', () => select(place));
      button.addEventListener('pointerenter', () => { activeResult = index; highlightQuick(); });
      quickMatches.appendChild(button);
    });
    highlightQuick();
  }
  function highlightQuick() {
    const buttons = quickMatches.querySelectorAll('button');
    buttons.forEach((button, index) => button.classList.toggle('active', index === activeResult));
    quick.querySelector('.location-go').title = quickResults[activeResult] ? `Fly to ${quickResults[activeResult].name}` : 'Search for a location first';
  }
  quickInput.addEventListener('input', refreshQuick);
  quickInput.addEventListener('focus', refreshQuick);
  quickInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') { suggestions.hidden = true; return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !quickResults.length) return;
    event.preventDefault(); suggestions.hidden = false;
    activeResult = (activeResult + (event.key === 'ArrowDown' ? 1 : -1) + quickResults.length) % quickResults.length;
    highlightQuick(); quickMatches.children[activeResult]?.scrollIntoView({ block: 'nearest' });
  });
  quick.addEventListener('submit', event => {
    event.preventDefault();
    const place = quickResults[activeResult];
    if (place) select(place); else refreshQuick();
  });
  document.addEventListener('pointerdown', event => { if (!quick.contains(event.target)) suggestions.hidden = true; });
  quick.addEventListener('focusout', event => { if (!quick.contains(event.relatedTarget)) suggestions.hidden = true; });
  function filter() {
    matching = searchPlaces(features, search.value, category.value); results.replaceChildren();
    if (loading) return;
    status.textContent = matching.length ? `${matching.length.toLocaleString()} matching places${matching.length > 30 ? ' · showing first 30' : ''}` : 'No matching landmarks. Try another name or category.';
    for (const place of matching.slice(0, 30)) {
      const button = document.createElement('button'); button.type = 'button';
      const name = document.createElement('span'); name.textContent = place.name;
      const type = document.createElement('small'); type.textContent = place.type;
      button.append(name, type); button.addEventListener('click', () => select(place)); results.appendChild(button);
    }
    lastUpdate = -Infinity;
  }
  async function load() {
    loading = true; retry.hidden = true; status.textContent = 'Loading local landmark catalog…';
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/mars-places.json`);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      if (catalog.schema_version !== 1 || !Array.isArray(catalog.features) || !catalog.features.length) throw Error('Unsupported catalog');
      features = catalog.features; loading = false; filter();
      if (document.activeElement === quickInput) refreshQuick();
    } catch (error) {
      loading = false; status.textContent = `Landmark catalog unavailable (${error.message}).`; retry.hidden = false;
      if (document.activeElement === quickInput) refreshQuick();
    }
  }
  search.addEventListener('input', filter); category.addEventListener('change', filter); retry.addEventListener('click', load); load();
  return { element, getFeatures: () => features, setEnabled(value) {
    enabled = value; overlay.hidden = !value; lastUpdate = -Infinity;
  }, update(now) {
    if (!enabled || !features.length || !isReady()) return;
    if (now - lastUpdate < 80) return;
    lastUpdate = now;
    if (!positions) positions = new Map(features.map(place => [place.id, new THREE.Vector3(...planetPoint(place.longitude, place.latitude, getRadius(place.longitude, place.latitude) + 300))]));
    const width = innerWidth, height = innerHeight, candidates = [];
    const visiblePlaces = selected && !matching.includes(selected) ? [selected, ...matching] : matching;
    for (const place of visiblePlaces) {
      const point = positions.get(place.id), radius = point.length();
      // Spherical horizon culling prevents labels on the back side of Mars.
      if (point.dot(camera.position) <= radius * radius) continue;
      direction.copy(point).sub(camera.position);
      const distance = direction.length(), apparent = place.diameter_km * 1000 * SCALE / distance;
      if (apparent < .025 && place.id !== selected?.id) continue;
      screen.copy(point).project(camera);
      if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > .93 || Math.abs(screen.y) > .9) continue;
      candidates.push({ place, x: (screen.x + 1) * width / 2, y: (1 - screen.y) * height / 2,
        width: Math.min(230, place.name.length * 6.8 + 22), score: place.id === selected?.id ? Infinity : apparent });
    }
    candidates.sort((a, b) => b.score - a.score);
    const labels = spacedLabels(candidates);
    pool.forEach((button, index) => {
      const item = labels[index];
      // Keep a focused label's identity stable until focus leaves the map.
      if (document.activeElement === button) return;
      button.hidden = !item;
      if (!item) return;
      button.textContent = item.place.name; button.title = `${item.place.name} · ${item.place.type} · fly to center`;
      button.style.left = `${item.x}px`; button.style.top = `${item.y}px`;
      button.classList.toggle('selected', item.place.id === selected?.id);
      button.onclick = () => { button.blur(); select(item.place); };
    });
  } };
}
