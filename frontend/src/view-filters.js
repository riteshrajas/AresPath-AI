import { createFilterRegistry } from "./filter-registry.js";
import { formatCoordinates } from "./coordinates.js";
import { layerUniforms, TERRAIN_MODES } from "./terrain-analysis.js";
import {
  applyViewPreset,
  VIEW_PRESETS,
  loadLocalList,
  validPin,
} from "./filter-presets.js";
import { createMapAnnotations } from "./map-annotations.js";
import { lightingPreferences } from "./terrain-shadows.js";
import "./view-filters.css";

const groups = [
  {
    id: "terrain",
    label: "Terrain & analysis",
    description:
      "Derived from the displayed elevation grid. Detail depends on the source and zoom.",
  },
  {
    id: "navigation",
    label: "Routes & navigation",
    description:
      "Display layers only. Route calculation settings stay in Routes.",
  },
  {
    id: "overlays",
    label: "Coordinates & reference",
    description: "Find your bearings on Mars.",
  },
  {
    id: "quality",
    label: "Data quality",
    description: "Understand where detail comes from and where it stops.",
  },
  {
    id: "effects",
    label: "Lighting & appearance",
    description: "Tune your view without changing measured terrain.",
  },
  {
    id: "places",
    label: "Places & saved pins",
    description: "Official landmarks and your own locations.",
  },
  {
    id: "science",
    label: "Future science layers",
    description: "These need validated datasets before they can be enabled.",
  },
];

export function createViewFilters({
  renderer,
  getMeshes,
  getFocus,
  places,
  camera,
  scene,
  getTerrain,
  getRouteState,
  getRadius,
  onSelect,
  setStarsEnabled,
}) {
  let storage;
  try {
    storage = localStorage;
  } catch {
    /* Session-only. */
  }
  const registry = createFilterRegistry({ storage });
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "turbo-toggle filters-trigger";
  trigger.textContent = "Filters";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "filters-panel");
  document.querySelector("header").appendChild(trigger);
  const panel = document.createElement("section");
  panel.id = "filters-panel";
  panel.className = "filters-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Filters");
  panel.innerHTML = `<div class="filters-heading"><div><span class="filters-eyebrow">MAKE MARS YOURS</span><h2>Layer library <small class="filter-count"></small></h2></div><button type="button" class="filters-close" aria-label="Close filters">×</button></div>
    <div class="filter-tools"><input class="filter-search" type="search" aria-label="Search filters" placeholder="Search layers, effects, data…"><div class="filter-presets" aria-label="View presets"></div><div class="filter-active" aria-label="Active filters"></div><button type="button" class="filters-clear">Clear overlays</button></div>
    <div class="filters-groups"></div><p class="filters-empty" hidden>No matching filters.</p>
    <div class="filter-save"><label for="preset-name">Save this view</label><div><input id="preset-name" maxlength="40" placeholder="Preset name"><button type="button" class="preset-save">Save</button></div><div class="saved-presets"></div><p role="status" class="preset-status"></p></div>
    <div class="filters-footer"><span>Preferences and saved pins stay on this device.</span><button type="button" class="filters-reset">Reset to defaults</button></div>`;
  document.body.appendChild(panel);
  const crosshair = document.createElement("div");
  crosshair.className = "view-crosshair";
  crosshair.hidden = true;
  crosshair.setAttribute("aria-hidden", "true");
  document.body.appendChild(crosshair);
  const readout = document.createElement("div");
  readout.className = "coordinate-readout";
  readout.hidden = true;
  readout.innerHTML =
    "<span>VIEW CENTER · APPROX.</span><output>Waiting for terrain…</output>";
  document.body.appendChild(readout);
  const legend = document.createElement("aside");
  legend.className = "terrain-legend";
  legend.hidden = true;
  legend.setAttribute("aria-label", "Terrain layer legend");
  document.body.appendChild(legend);
  const dataInfo = document.createElement("aside");
  dataInfo.className = "terrain-data-info";
  dataInfo.hidden = true;
  dataInfo.setAttribute("aria-label", "Visible terrain sources");
  document.body.appendChild(dataInfo);
  let lastReadout = -Infinity,
    contrast = 1,
    saturation = 1,
    wireframe = false;
  const materialStates = new WeakMap();
  const updateColor = () => {
    renderer.domElement.style.filter =
      contrast === 1 && saturation === 1
        ? "none"
        : `contrast(${contrast}) saturate(${saturation})`;
  };
  const toggle = (id, group, label, description, value = false, apply) =>
    registry.register({
      id,
      group,
      type: "toggle",
      label,
      description,
      default: value,
      apply,
    });
  const uniformToggle = (
    id,
    group,
    label,
    description,
    uniform,
    value = false,
  ) =>
    toggle(id, group, label, description, value, (value) => {
      layerUniforms[uniform].value = +value;
    });
  const range = (id, group, label, min, max, step, value, apply, format) =>
    registry.register({
      id,
      group,
      type: "range",
      label,
      min,
      max,
      step,
      default: value,
      apply,
      format,
    });
  registry.register({
    id: "terrain-mode",
    group: "terrain",
    type: "select",
    label: "Surface layer",
    default: "natural",
    options: TERRAIN_MODES,
    description:
      "One color layer at a time; combine it with contours and annotations.",
    apply: (value) => {
      layerUniforms.terrainMode.value = TERRAIN_MODES.findIndex(
        (mode) => mode.value === value,
      );
    },
  });
  range(
    "layer-opacity",
    "terrain",
    "Color layer opacity",
    0.1,
    1,
    0.05,
    0.8,
    (value) => {
      layerUniforms.layerOpacity.value = value;
    },
    (value) => `${Math.round(value * 100)}%`,
  );
  uniformToggle(
    "contours",
    "terrain",
    "Elevation contours",
    "Elevation lines fade when too dense to distinguish.",
    "contoursEnabled",
  );
  range(
    "contour-interval",
    "terrain",
    "Contour interval",
    10,
    1000,
    10,
    100,
    (value) => {
      layerUniforms.contourInterval.value = value;
    },
    (value) => `${value} m`,
  );
  uniformToggle(
    "steep-terrain",
    "terrain",
    "Highlight steep terrain",
    "Display threshold only. Does not change route safety constraints.",
    "steepEnabled",
  );
  range(
    "steep-threshold",
    "terrain",
    "Steep highlight threshold",
    1,
    45,
    1,
    20,
    (value) => {
      layerUniforms.steepThreshold.value = value;
    },
    (value) => `${value}°`,
  );
  toggle(
    "wireframe",
    "terrain",
    "Terrain wireframe",
    "Inspect the actual mesh, including newly loaded tiles.",
    false,
    (value) => {
      wireframe = value;
    },
  );
  for (const [id, label, description, initial] of [
    ["route-lines", "Route paths", "Show the selected computed path.", true],
    [
      "all-routes",
      "Compare all three routes",
      "Show every available path together; identical paths may overlap.",
      false,
    ],
    [
      "route-endpoints",
      "Start & destination labels",
      "Surface markers for the completed route.",
      true,
    ],
    [
      "route-directions",
      "Direction arrows",
      "Arrows along the selected path from start to finish.",
      false,
    ],
    [
      "route-distances",
      "Distance markers",
      "Evenly spaced traveled-distance labels.",
      false,
    ],
    [
      "route-profile",
      "Elevation profile",
      "Scrub the chart to locate a point on the selected route.",
      false,
    ],
    [
      "route-corridor",
      "Planning corridor",
      "The boundary of the analyzed region.",
      false,
    ],
  ])
    toggle(id, "navigation", label, description, initial);
  toggle(
    "coordinates",
    "overlays",
    "Show coordinates",
    "Approximate latitude and longitude at the view center.",
    false,
    (value) => {
      readout.hidden = !value;
      lastReadout = -Infinity;
    },
  );
  toggle(
    "crosshair",
    "overlays",
    "Center crosshair",
    "Aim to pick route endpoints and saved pins.",
    false,
    (value) => {
      crosshair.hidden = !value;
    },
  );
  uniformToggle(
    "graticule",
    "overlays",
    "Latitude / longitude grid",
    "Geographic lines draped over the visible surface.",
    "graticuleEnabled",
  );
  registry.register({
    id: "grid-spacing",
    group: "overlays",
    type: "select",
    label: "Grid spacing",
    default: 10,
    options: [0.01, 0.1, 1, 5, 10, 30].map((value) => ({
      value,
      label: `${value}°`,
    })),
    apply: (value) => {
      layerUniforms.graticuleInterval.value = value;
    },
  });
  toggle(
    "camera-altitude",
    "overlays",
    "Camera altitude",
    "Approximate radial clearance above terrain beneath the camera.",
  );
  toggle(
    "scale-bar",
    "overlays",
    "Ground scale bar",
    "Approximate scale at the center of the view; hides when aimed at sky.",
  );
  toggle(
    "compass",
    "overlays",
    "Compass / north reference",
    "Heading indicator in navigation controls; click N to face north.",
    true,
    (value) => {
      const compass = document.querySelector(".compass-heading");
      if (compass) compass.hidden = !value;
    },
  );
  toggle(
    "data-info",
    "quality",
    "Visible source information",
    "Prepared source resolution and display grid spacing are different.",
    false,
    (value) => {
      dataInfo.hidden = !value;
    },
  );
  uniformToggle(
    "source-seams",
    "quality",
    "Source transition edges",
    "Magenta marks a change of DEM source; offsets can occur there.",
    "seamsEnabled",
  );
  uniformToggle(
    "basemap",
    "effects",
    "Surface imagery",
    "Turn imagery off to inspect illuminated geometry.",
    "basemapEnabled",
    true,
  );
  toggle(
    "stars",
    "effects",
    "Stars in real-time sky",
    "Controls the star catalog when RT sky is enabled in the header.",
    true,
    (value) => setStarsEnabled?.(value),
  );
  toggle(
    "shadows",
    "effects",
    "Terrain cast shadows",
    "Requires Terrain lighting in the header. Turn off to reduce rendering work.",
    true,
    (value) => {
      lightingPreferences.shadows = value;
    },
  );
  range(
    "sun-azimuth",
    "effects",
    "Exploration light direction",
    0,
    360,
    5,
    45,
    (value) => {
      lightingPreferences.azimuth = value;
    },
    (value) => `${value}° · RT overrides`,
  );
  range(
    "sun-elevation",
    "effects",
    "Exploration light elevation",
    10,
    85,
    5,
    35,
    (value) => {
      lightingPreferences.elevation = value;
    },
    (value) => `${value}° · RT overrides`,
  );
  range(
    "exposure",
    "effects",
    "Exposure",
    0.4,
    2,
    0.05,
    1.05,
    (value) => {
      renderer.toneMappingExposure = value;
    },
    (value) => `${value.toFixed(2)}×`,
  );
  range(
    "contrast",
    "effects",
    "Contrast",
    0.5,
    1.5,
    0.05,
    1,
    (value) => {
      contrast = value;
      updateColor();
    },
    (value) => `${Math.round(value * 100)}%`,
  );
  range(
    "saturation",
    "effects",
    "Saturation",
    0,
    2,
    0.05,
    1,
    (value) => {
      saturation = value;
      updateColor();
    },
    (value) => `${Math.round(value * 100)}%`,
  );
  toggle(
    "places",
    "places",
    "Place labels",
    "Official landmark labels. Choose feature categories below.",
    true,
    (value) => places?.setEnabled(value),
  );
  toggle(
    "saved-places",
    "places",
    "Saved location pins",
    "Save the crosshair position below and fly back whenever you want.",
  );
  for (const [id, label, description] of [
    [
      "landing-sites",
      "Mission landing sites",
      "Needs a curated mission-coordinate catalog with source citations.",
    ],
    [
      "rover-tracks",
      "Rover traverse history",
      "Needs dated official rover positions and terrain alignment.",
    ],
    [
      "geology",
      "Geological units",
      "Needs georeferenced geological polygons and unit legends.",
    ],
    [
      "dunes",
      "Dunes & sand deposits",
      "Needs mapped dune and sand coverage; DEM roughness cannot identify sand.",
    ],
    [
      "thermal",
      "Thermal inertia",
      "Needs calibrated THEMIS products, units and coverage.",
    ],
    [
      "ice",
      "Water / ice evidence",
      "Needs observation maps with dates and uncertainty.",
    ],
    [
      "weather",
      "Dust & weather",
      "Needs a time-indexed observation or model feed.",
    ],
  ])
    registry.register({
      id,
      group: "science",
      type: "toggle",
      label,
      description,
      default: false,
      disabled: true,
      badge: "Dataset needed",
    });

  let pins = loadLocalList(storage, "arespath.pins.v1", validPin, 50);
  const annotations = createMapAnnotations({
    camera,
    scene,
    registry,
    getRouteState,
    getRadius,
    getFocus,
    getPins: () => pins,
    onSelect,
  });
  const persist = (key, value, status) => {
    try {
      if (!storage) throw Error();
      storage.setItem(key, JSON.stringify(value));
      status.textContent = "Saved on this device.";
    } catch {
      status.textContent =
        "Available this session; browser storage is unavailable or full.";
    }
  };
  const pinEditor = document.createElement("div");
  pinEditor.className = "pin-editor";
  pinEditor.innerHTML =
    '<label for="pin-name">Bookmark the crosshair</label><input id="pin-name" maxlength="80" placeholder="Name this location"><button type="button" class="pin-save">Save view-center location</button><p class="pin-status" role="status"></p><div class="pin-list"></div>';
  function renderPins() {
    const container = pinEditor.querySelector(".pin-list");
    container.replaceChildren();
    for (const pin of pins) {
      const row = document.createElement("div"),
        go = document.createElement("button"),
        remove = document.createElement("button");
      go.type = remove.type = "button";
      go.textContent = pin.name;
      go.title = formatCoordinates(pin);
      go.onclick = () => onSelect(pin);
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Delete pin ${pin.name}`);
      remove.onclick = () => {
        pins = pins.filter((item) => item !== pin);
        persist(
          "arespath.pins.v1",
          pins,
          pinEditor.querySelector(".pin-status"),
        );
        renderPins();
        annotations.refresh();
      };
      row.append(go, remove);
      container.appendChild(row);
    }
  }
  pinEditor.querySelector(".pin-save").onclick = () => {
    const point = getFocus(),
      status = pinEditor.querySelector(".pin-status");
    if (!point) {
      status.textContent = "Aim at the surface before saving a pin.";
      return;
    }
    if (pins.length >= 50) {
      status.textContent = "50 pins saved. Delete one to make room.";
      return;
    }
    const input = pinEditor.querySelector("input");
    pins.push({
      name: input.value.trim() || `Mars location ${pins.length + 1}`,
      longitude: point.longitude,
      latitude: point.latitude,
    });
    input.value = "";
    persist("arespath.pins.v1", pins, status);
    renderPins();
    registry.set("saved-places", true);
    annotations.refresh();
  };
  renderPins();

  const fields = new Map(),
    sections = new Map();
  function search() {
    const query = panel
      .querySelector(".filter-search")
      .value.toLowerCase()
      .trim();
    let visible = 0;
    for (const [id, section] of sections) {
      const group = groups.find((group) => group.id === id) || { label: id };
      let count = 0;
      for (const item of registry.list().filter((item) => item.group === id)) {
        const match = `${group.label} ${item.label} ${item.description || ""} ${(item.options || []).map(option => option.label).join(" ")}`
          .toLowerCase()
          .includes(query);
        fields.get(item.id).row.hidden = !match;
        count += +match;
      }
      section.hidden = !count;
      if (query && count) section.open = true;
      visible += count;
      if (id === "places") {
        if (places)
          places.element.hidden = !!query && fields.get("places").row.hidden;
        pinEditor.hidden = !!query && fields.get("saved-places").row.hidden;
      }
    }
    panel.querySelector(".filters-empty").hidden = visible > 0;
  }
  function updateDataInfo() {
    dataInfo.hidden = !registry.get("data-info");
    if (dataInfo.hidden) return;
    const data = getTerrain()?.data;
    dataInfo.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "VISIBLE TERRAIN DATA";
    dataInfo.appendChild(heading);
    const displaySpacing = data
      ? Math.round(
          ((((data.bounds[3] - data.bounds[1]) * Math.PI) / 180) * 3396000) /
            Math.max(1, data.rows - 1),
        )
      : 29600;
    const lines = data
      ? [
          ...(data.sourceMetadata || []).map(
            (source) =>
              `${source.name} · ${Number(source.prepared_resolution_m).toLocaleString()} m prepared pixels`,
          ),
          `${data.cols} × ${data.rows} display samples · ~${displaySpacing.toLocaleString()} m north–south spacing`,
          "Coarse fallback and interpolated samples do not add high-resolution measurements.",
          "Unloaded areas and display collars are not measured local detail.",
        ]
      : [
          "MOLA overview · ~14.8 km source pixels · ~29.6 km display spacing",
          "Radius relative to a 3,396 km sphere. Coarse global overview only; zoom in for local source data.",
        ];
    for (const text of lines) {
      const p = document.createElement("p");
      p.textContent = text;
      dataInfo.appendChild(p);
    }
  }
  function render() {
    const list = registry.list();
    if (fields.size !== list.length) {
      fields.clear();
      sections.clear();
      const container = panel.querySelector(".filters-groups");
      container.replaceChildren();
      const customGroups = [...groups];
      for (const item of list)
        if (!customGroups.some((group) => group.id === item.group))
          customGroups.push({ id: item.group, label: item.group });
      for (const group of customGroups) {
        const section = document.createElement("details");
        section.className = "filter-group";
        section.open = ["terrain", "navigation"].includes(group.id);
        const heading = document.createElement("summary");
        heading.textContent = group.label;
        section.appendChild(heading);
        if (group.description) {
          const description = document.createElement("p");
          description.className = "filter-group-description";
          description.textContent = group.description;
          section.appendChild(description);
        }
        for (const item of list.filter((filter) => filter.group === group.id)) {
          const row = document.createElement("div");
          row.className = `filter-row filter-${item.type}`;
          const label = document.createElement("label");
          label.htmlFor = `filter-${item.id}`;
          label.textContent = item.label;
          const input = document.createElement(
            item.type === "select" ? "select" : "input",
          );
          input.id = label.htmlFor;
          input.disabled = !!item.disabled;
          const output = document.createElement("output");
          output.htmlFor = input.id;
          if (item.type === "select")
            for (const option of item.options) {
              const element = document.createElement("option");
              element.value = String(option.value);
              element.textContent = option.label;
              input.appendChild(element);
            }
          else {
            input.type = item.type === "toggle" ? "checkbox" : "range";
            if (item.type === "range") {
              input.min = item.min;
              input.max = item.max;
              input.step = item.step;
            }
          }
          input.addEventListener("input", () =>
            registry.set(
              item.id,
              item.type === "toggle"
                ? input.checked
                : item.type === "select"
                  ? item.options.find(
                      (option) => String(option.value) === input.value,
                    ).value
                  : Number(input.value),
            ),
          );
          row.append(label);
          if (item.badge) {
            const badge = document.createElement("span");
            badge.className = "filter-badge";
            badge.textContent = item.badge;
            row.appendChild(badge);
          }
          if (item.type === "range") row.appendChild(output);
          row.appendChild(input);
          if (item.description) {
            const description = document.createElement("p");
            description.id = `${input.id}-description`;
            description.textContent = item.description;
            input.setAttribute("aria-describedby", description.id);
            row.appendChild(description);
          }
          section.appendChild(row);
          fields.set(item.id, { input, output, row });
        }
        if (group.id === "places") {
          section.appendChild(pinEditor);
          if (places) section.appendChild(places.element);
        }
        container.appendChild(section);
        sections.set(group.id, section);
      }
    }
    for (const item of list) {
      const { input, output } = fields.get(item.id);
      if (item.type === "toggle") input.checked = item.value;
      else {
        input.value = item.value;
        if (item.type === "range") {
          output.value = item.format?.(item.value) || String(item.value);
          input.setAttribute("aria-valuetext", output.value);
        }
      }
    }
    const active = list.filter(
      (item) =>
        !item.disabled &&
        (item.type === "toggle" ? item.value : item.value !== item.default),
    );
    panel.querySelector(".filter-count").textContent =
      `${list.filter((item) => !item.disabled).length} controls`;
    const chips = panel.querySelector(".filter-active");
    chips.replaceChildren();
    for (const item of active) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = `${item.label} ×`;
      chip.title = `Reset ${item.label}`;
      chip.onclick = () =>
        registry.set(item.id, item.type === "toggle" ? false : item.default);
      chips.appendChild(chip);
    }
    updateLegend();
    updateDataInfo();
    annotations.refresh();
    search();
  }
  function updateLegend() {
    const mode = registry.get("terrain-mode");
    legend.hidden =
      mode === "natural" &&
      !registry.get("contours") &&
      !registry.get("steep-terrain") &&
      !registry.get("source-seams");
    legend.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = TERRAIN_MODES.find((item) => item.value === mode).label;
    legend.appendChild(title);
    const labels = {
      elevation: "−8 km → +22 km · see datum below",
      slope: "0° → 35°+ · displayed-grid estimate",
      roughness: "0 → 100+ m · 3 × 3 elevation residual",
      resolution: "1 m → 16 km · prepared source pixels",
      coverage:
        "Green: ≤1 km source · amber: coarser · gray: unavailable / seam / collar",
      relief: "Geometry lighting · imagery suppressed",
    };
    const note = (text) => {
      const p = document.createElement("p");
      p.textContent = text;
      legend.appendChild(p);
    };
    if (labels[mode]) {
      if (["elevation", "slope", "roughness", "resolution"].includes(mode)) {
        const bar = document.createElement("div");
        bar.className = "legend-ramp";
        legend.appendChild(bar);
      }
      note(labels[mode]);
    }
    if (
      ["elevation", "slope", "roughness"].includes(mode) ||
      registry.get("contours")
    )
      note(
        getTerrain()?.data
          ? "Local DEM heights use the source areoid datum. Derivatives depend on display spacing."
          : "Global overview: radius relative to 3,396 km sphere; coarse relief only.",
      );
    for (const [id, text] of [
      ["contours", `Contours every ${registry.get("contour-interval")} m`],
      [
        "steep-terrain",
        `Pink: slope > ${registry.get("steep-threshold")}° (display only)`,
      ],
      ["source-seams", "Magenta: DEM source transition"],
    ])
      if (registry.get(id)) note(text);
  }
  for (const preset of VIEW_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.name;
    button.onclick = () => applyViewPreset(registry, preset);
    panel.querySelector(".filter-presets").appendChild(button);
  }
  let presets = loadLocalList(
    storage,
    "arespath.presets.v1",
    (item) =>
      item &&
      typeof item.name === "string" &&
      item.name.length <= 40 &&
      item.values &&
      typeof item.values === "object",
  );
  function renderPresets() {
    const container = panel.querySelector(".saved-presets");
    container.replaceChildren();
    for (const preset of presets) {
      const row = document.createElement("div"),
        button = document.createElement("button"),
        remove = document.createElement("button");
      button.type = remove.type = "button";
      button.textContent = preset.name;
      button.onclick = () => applyViewPreset(registry, preset);
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Delete preset ${preset.name}`);
      remove.onclick = () => {
        presets = presets.filter((item) => item !== preset);
        persist(
          "arespath.presets.v1",
          presets,
          panel.querySelector(".preset-status"),
        );
        renderPresets();
      };
      row.append(button, remove);
      container.appendChild(row);
    }
  }
  panel.querySelector(".preset-save").onclick = () => {
    const input = panel.querySelector("#preset-name"),
      name = input.value.trim(),
      status = panel.querySelector(".preset-status");
    if (!name) {
      status.textContent = "Give the preset a name.";
      return;
    }
    if (presets.length >= 20 && !presets.some((item) => item.name === name)) {
      status.textContent = "20 presets saved. Delete one to make room.";
      return;
    }
    presets = presets.filter((item) => item.name !== name);
    presets.push({ name, values: registry.snapshot() });
    persist("arespath.presets.v1", presets, status);
    renderPresets();
    input.value = "";
  };
  renderPresets();
  registry.subscribe(render);
  render();
  function setOpen(open, restoreFocus = false) {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector(".filter-search").focus();
    if (!open && restoreFocus) trigger.focus();
  }
  trigger.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".filters-close").onclick = () => setOpen(false, true);
  panel.querySelector(".filters-reset").onclick = () => registry.reset();
  panel.querySelector(".filters-clear").onclick = () => {
    for (const item of registry.list())
      if (item.type === "toggle" && item.group !== "effects")
        registry.set(item.id, false);
    registry.set("terrain-mode", "natural");
  };
  panel.querySelector(".filter-search").addEventListener("input", search);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false, true);
    }
  });
  panel.addEventListener("place-selected", () => {
    setOpen(true);
    sections.get("places").open = true;
  });
  let lastTerrain;
  return {
    registry,
    update(now) {
      for (const mesh of getMeshes())
        if (mesh)
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            if (materialStates.get(material) !== wireframe) {
              material.wireframe = wireframe;
              material.needsUpdate = true;
              materialStates.set(material, wireframe);
            }
      annotations.update(now);
      if (now - lastReadout < 200) return;
      lastReadout = now;
      if (registry.get("coordinates"))
        readout.querySelector("output").value = formatCoordinates(getFocus());
      const terrain = getTerrain();
      if (terrain !== lastTerrain) {
        lastTerrain = terrain;
        updateLegend();
        updateDataInfo();
      }
    },
  };
}
