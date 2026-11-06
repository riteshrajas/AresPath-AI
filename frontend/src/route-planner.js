import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { planetPoint } from './globe-math.js';
import { formatCoordinates } from './coordinates.js';
import { searchPlaces } from './places-data.js';
import './route-planner.css';

const profiles = { safest: { label: 'Safest', color: '#8ee2b0', description: 'Prioritizes gentler slopes and lower local relief; may be longer.' }, balanced: { label: 'Balanced', color: '#edc17f', description: 'Trades travel distance against slope and local relief.' }, shortest: { label: 'Shortest', color: '#98caff', description: 'Minimizes sampled travel distance within the slope limit.' } };
const distanceText = value => value < 1000 ? `${Math.round(value)} m` : `${(value/1000).toFixed(2)} km`;
export function createRoutePlanner({ scene, apiBase, getFocus, getPlaces, onView, onReplay, onReplayCancel, filters }) {
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'turbo-toggle'; trigger.textContent = 'Routes'; trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'route-planner'); document.querySelector('header').appendChild(trigger);
  const panel = document.createElement('section'); panel.id = 'route-planner'; panel.className = 'route-planner'; panel.hidden = true; panel.setAttribute('aria-label', 'Terrain route planner');
  panel.innerHTML = `<div class="routes-heading"><div><small>TERRAIN ANALYSIS</small><h2>Plan a surface route</h2></div><button type="button" aria-label="Close route planner" class="routes-close">×</button></div><div class="routes-body"><p class="routes-intro">Choose two places or aim the crosshair at terrain. Compare three routes using prepared elevation data.</p><div class="route-endpoints"></div><button type="button" class="route-swap">Swap start and destination ⇅</button><label class="route-setting">Analysis detail<select class="route-detail"><option value="standard">Standard · up to ~60,000 cells</option><option value="detailed">Detailed · up to ~210,000 cells</option></select></label><label class="route-setting">Maximum slope (degrees)<input class="route-slope" type="number" min="1" max="35" step="1" value="25"></label><p class="route-help">Safest caps slopes at 12°, balanced at 20°, shortest at 25°. Your setting can lower these limits. Regional legs up to 1,500 km, away from the poles.</p><div class="route-actions"><button type="button" class="route-calculate">Analyze terrain &amp; compare routes</button><button type="button" class="route-cancel" hidden>Cancel</button></div><progress class="route-progress" max="100" value="0" hidden></progress><p class="route-status" role="status" aria-live="polite">Choose a start and destination.</p><div class="route-results"></div><div class="route-analysis"></div><p class="route-caution">Terrain estimates only. Elevation data can miss rocks, sand and small bumps. “Safest” means lowest modeled terrain risk, not verified rover safety.</p></div>`;
  document.body.appendChild(panel);
  const status = panel.querySelector('.route-status'), calculate = panel.querySelector('.route-calculate'), cancelButton = panel.querySelector('.route-cancel'), progress = panel.querySelector('progress');
  const results = panel.querySelector('.route-results'), analysis = panel.querySelector('.route-analysis');
  const fields = {}, endpoints = { start: null, destination: null }, lines = [];
  let busy = false, jobId, generation = 0, selectedRoute, currentResult;
  const crosshair = document.createElement('div'); crosshair.className = 'view-crosshair route-crosshair'; crosshair.hidden = true; document.body.appendChild(crosshair);
  const hidePanel = () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); crosshair.hidden = true; trigger.focus(); };
  trigger.addEventListener('click', () => {
    if (!panel.hidden) return hidePanel();
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); crosshair.hidden = false;
    panel.querySelector('input').focus();
  });
  panel.querySelector('.routes-close').addEventListener('click', hidePanel);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); hidePanel(); } });
  function clearLines() { for (const line of lines) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); } lines.length = 0; }
  function clearResults() { clearLines(); currentResult=null; selectedRoute=null; results.replaceChildren(); analysis.replaceChildren(); }
  function invalidate() { onReplayCancel?.(); generation++; if (jobId) cancelJob(jobId); jobId = null; setBusy(false); clearResults(); status.textContent = 'Inputs changed. Analyze again to compare routes.'; }
  function setBusy(value) {
    busy = value; calculate.disabled = value; cancelButton.hidden = !value; progress.hidden = !value;
    trigger.textContent = value ? 'Routes · analyzing' : 'Routes';
  }
  function setEndpoint(key, point) {
    invalidate(); endpoints[key] = { longitude: point.longitude, latitude: point.latitude, name: point.name || 'Crosshair point' };
    fields[key].input.value = endpoints[key].name;
    fields[key].coordinates.textContent = formatCoordinates(point);
    fields[key].matches.replaceChildren();
    status.textContent = 'Endpoint updated. Ready to analyze when both are set.';
  }
  for (const [key, label] of [['start', 'Start'], ['destination', 'Destination']]) {
    const row = document.createElement('div'); row.className = 'route-endpoint';
    const heading = document.createElement('label'); heading.htmlFor = `route-${key}`; heading.textContent = label;
    const input = document.createElement('input'); input.id = heading.htmlFor; input.type = 'search'; input.placeholder = 'Search a landmark…'; input.autocomplete = 'off';
    const coordinates = document.createElement('p'); coordinates.className = 'endpoint-coordinates'; coordinates.textContent = 'No point selected';
    const pick = document.createElement('button'); pick.type = 'button'; pick.textContent = `Set ${label.toLowerCase()} at crosshair`;
    pick.addEventListener('click', () => {
      const point = getFocus();
      if (!point) { status.textContent = 'The crosshair is pointing at sky or terrain is still loading. Aim at the surface and try again.'; return; }
      setEndpoint(key, { ...point, name: `${label} · crosshair` });
    });
    const matches = document.createElement('div'); matches.className = 'endpoint-matches';
    input.addEventListener('input', () => {
      invalidate(); endpoints[key] = null; coordinates.textContent = 'Choose a search result to confirm this point.'; matches.replaceChildren();
      if (!input.value.trim()) return;
      const found = searchPlaces(getPlaces(), input.value).slice(0, 6);
      if (!found.length) matches.textContent = 'No matching places (catalog may still be loading).';
      for (const place of found) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `${place.name} · ${place.type}`;
        button.addEventListener('click', () => setEndpoint(key, place)); matches.appendChild(button);
      }
    });
    row.append(heading, input, coordinates, pick, matches); panel.querySelector('.route-endpoints').appendChild(row);
    fields[key] = { input, coordinates, matches };
  }
  panel.querySelector('.route-swap').addEventListener('click', () => {
    invalidate(); [endpoints.start, endpoints.destination] = [endpoints.destination, endpoints.start];
    for (const key of Object.keys(fields)) { fields[key].input.value = endpoints[key]?.name || ''; fields[key].coordinates.textContent = endpoints[key] ? formatCoordinates(endpoints[key]) : 'No point selected'; fields[key].matches.replaceChildren(); }
  });
  panel.querySelector('.route-detail').addEventListener('change', invalidate); panel.querySelector('.route-slope').addEventListener('input', invalidate);
  async function request(path, options = {}) {
    const response = await fetch(apiBase + '/api/v1/routes' + path, options);
    const body = await response.json();
    if (!response.ok) throw Error(typeof body.detail === 'string' ? body.detail : `Route API returned ${response.status}. Check endpoints and slope settings.`);
    return body;
  }
  async function cancelJob(id) { try { await request('/'+id, { method: 'DELETE' }); } catch { /* Poll or next request reports server availability. */ } }
  cancelButton.addEventListener('click', () => { invalidate(); status.textContent = 'Analysis canceled. You can change endpoints and try again.'; });
  function showRoute(route) {
    onReplayCancel?.();
    selectedRoute = route.id;
    for (const line of lines) line.visible = line.userData.route === selectedRoute;
    for (const button of results.querySelectorAll('[data-route]')) button.setAttribute('aria-pressed', String(button.dataset.route === selectedRoute));
  }
  function renderResult(result) {
    currentResult = result;
    results.replaceChildren(); analysis.replaceChildren(); clearLines();
    for (const route of result.routes) {
      const profile = profiles[route.id], card = document.createElement('article'); card.className = 'terrain-route'; card.style.setProperty('--route-color', profile.color);
      const title = document.createElement('h3'); title.textContent = profile.label; card.appendChild(title);
      const description = document.createElement('p'); description.textContent = profile.description; card.appendChild(description);
      if (route.status !== 'ready') { const reason = document.createElement('p'); reason.textContent = route.reason; card.appendChild(reason); }
      else {
        const metrics = document.createElement('p'); metrics.className = 'route-metrics'; metrics.textContent = `${distanceText(route.distance_m)} · ↑ ${Math.round(route.ascent_m)} m · max ${route.max_slope_deg}° slope`; card.appendChild(metrics);
        const relief = document.createElement('p'); relief.textContent = `Peak local elevation residual: ${route.max_roughness_m} m. Slope cap: ${route.slope_limit_deg}°.`; card.appendChild(relief);
        if (route.same_as) { const same = document.createElement('p'); same.textContent = `Same computed path as ${profiles[route.same_as].label.toLowerCase()}.`; card.appendChild(same); }
        const button = document.createElement('button'); button.type = 'button'; button.dataset.route = route.id; button.textContent = 'Show this route'; button.addEventListener('click', () => showRoute(route)); card.appendChild(button);
        const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View route area'; view.addEventListener('click', () => { showRoute(route); onView(result); }); card.appendChild(view);
        const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = 'Cinematic Replay'; replay.title = 'Prepare every terrain cell along this route at the best available source detail, then replay start to finish';
        replay.addEventListener('click', () => { showRoute(route); hidePanel(); onReplay?.(route,result); }); card.appendChild(replay);
        const material = new LineMaterial({ color: profile.color, linewidth: 4, transparent: true, opacity: .95, depthTest: true }); material.resolution.set(innerWidth, innerHeight);
        const geometry = new LineGeometry(); geometry.setPositions(route.points.flatMap(([lon,lat,radius]) => planetPoint(lon,lat,radius+Math.max(5,result.grid.spacing_m*.03))));
        const line = new Line2(geometry, material); line.computeLineDistances(); line.userData.route = route.id; scene.add(line); lines.push(line);
      }
      results.appendChild(card);
    }
    const summary = document.createElement('p'); summary.textContent = `${result.grid.cells.toLocaleString()} elevation samples · ~${Math.round(result.grid.spacing_m)} m planning spacing · ${result.elapsed_seconds}s processing`; analysis.appendChild(summary);
    for (const source of result.sources) { const line = document.createElement('p'); line.textContent = `${source.name} · prepared resolution ${source.prepared_resolution_m} m`; analysis.appendChild(line); }
    for (const warning of result.warnings) { const line = document.createElement('p'); line.className = 'route-warning'; line.textContent = warning; analysis.appendChild(line); }
    const first = result.routes.find(route => route.status === 'ready'); if (first) { showRoute(first); onView(result); }
    status.textContent = first ? 'Analysis complete. Select a route to compare.' : 'Analysis complete: no traversable paths found in this corridor at these limits.';
    results.firstElementChild?.scrollIntoView({ block: 'start' });
  }
  calculate.addEventListener('click', async () => {
    if (busy) return;
    if (!endpoints.start || !endpoints.destination) { status.textContent = 'Select both endpoints using search results or the crosshair.'; return; }
    const slope = Number(panel.querySelector('.route-slope').value);
    if (!Number.isFinite(slope) || slope < 1 || slope > 35) { status.textContent = 'Maximum slope must be between 1° and 35°.'; return; }
    invalidate(); const token = generation; setBusy(true); progress.value = 0; status.textContent = 'Submitting terrain analysis…';
    try {
      const job = await request('', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ start:endpoints.start, destination:endpoints.destination, detail:panel.querySelector('.route-detail').value, max_slope_deg:slope }) });
      if (token !== generation) { await cancelJob(job.id); return; }
      jobId = job.id;
      for (;;) {
        const state = await request('/'+job.id);
        if (token !== generation) return;
        status.textContent = state.message; progress.value = state.progress;
        if (state.status === 'complete') { jobId = null; setBusy(false); renderResult(state.result); return; }
        if (['failed','canceled'].includes(state.status)) throw Error(state.message);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (error) {
      if (token !== generation) return;
      if (jobId) cancelJob(jobId); jobId = null; setBusy(false); status.textContent = `Analysis stopped: ${error.message}`;
    }
  });
  return { getState: () => ({result:currentResult,selectedRoute}), update() {
    for (const line of lines) {
      line.material.resolution.set(innerWidth, innerHeight);
      line.visible = Boolean(filters?.get('all-routes') || ((filters?.get('route-lines') ?? true) && line.userData.route === selectedRoute));
      line.material.opacity = line.userData.route === selectedRoute ? .95 : .5;
    }
  }, setEndpoint };
}
