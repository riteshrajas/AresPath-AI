export const PLACE_CATEGORIES = { all: 'All features', mountains: 'Mountains & volcanoes', valleys: 'Valleys & canyons', craters: 'Craters', plains: 'Plains', regions: 'Regions', other: 'Other features' };
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function searchPlaces(features, query = '', category = 'all') {
  const term = normalize(query);
  return features.filter(place => (category === 'all' || place.category === category) && normalize(place.name).includes(term))
    .sort((a, b) => {
      const aName = normalize(a.name), bName = normalize(b.name);
      if (term) {
        const rank = name => name === term ? 0 : name.startsWith(term) ? 1 : 2;
        if (rank(aName) !== rank(bName)) return rank(aName) - rank(bName);
      }
      return b.diameter_km - a.diameter_km || aName.localeCompare(bName);
    });
}
export function placeViewRange(place) {
  return Math.max(3000, Math.min(800000, place.diameter_km * 1400));
}

// Reserve screen rectangles rather than letting labels pile up on one another.
export function spacedLabels(candidates, limit = 22) {
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some(other => Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 + 10 && Math.abs(other.y - candidate.y) < 28)) continue;
    accepted.push(candidate); if (accepted.length >= limit) break;
  }
  return accepted;
}
