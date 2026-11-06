import * as THREE from "three";
import { planetPoint, SCALE } from "./globe-math.js";
import { routeTrack } from "./cinematic-path.js";
import {
  buildRouteProfile,
  profileAt,
  formatDistance,
} from "./route-profile.js";

export function createMapAnnotations({
  camera,
  registry,
  getRouteState,
  getRadius,
  getFocus,
  getPins,
  onSelect,
  scene,
}) {
  const overlay = document.createElement("div");
  overlay.className = "map-annotations";
  overlay.setAttribute("aria-label", "Map annotations");
  document.body.appendChild(overlay);
  const altitude = document.createElement("output");
  altitude.className = "camera-altitude";
  altitude.hidden = true;
  document.body.appendChild(altitude);
  const scale = document.createElement("div");
  scale.className = "ground-scale";
  scale.hidden = true;
  scale.innerHTML =
    "<span></span><i></i><small>View-center scale · approx.</small>";
  document.body.appendChild(scale);
  const scaleRay = new THREE.Raycaster(),
    scaleSphere = new THREE.Sphere(),
    scaleLeft = new THREE.Vector3(),
    scaleRight = new THREE.Vector3();
  const profile = document.createElement("section");
  profile.className = "route-profile";
  profile.hidden = true;
  profile.setAttribute("aria-label", "Selected route elevation profile");
  profile.innerHTML =
    '<div class="profile-heading"><strong>Route elevation</strong><button type="button" aria-label="Hide elevation profile">×</button></div><p class="profile-datum"></p><svg viewBox="0 0 600 100" role="img" aria-label="Elevation along the selected route" preserveAspectRatio="none"><path class="profile-area"/><polyline class="profile-line"/><line class="profile-cursor" y1="0" y2="100"/></svg><div class="profile-axis"></div><input type="range" min="0" max="1000" step="1" value="0" aria-label="Inspect distance along route"><output></output><p class="profile-empty">Calculate a route in Routes to see its elevation profile.</p>';
  document.body.appendChild(profile);
  profile.querySelector("button").onclick = () =>
    registry.set("route-profile", false);
  const svg = profile.querySelector("svg"),
    slider = profile.querySelector("input"),
    output = profile.querySelector("output");
  let dirty = true,
    previousResult,
    previousSelected,
    track,
    chart,
    markers = [],
    lastUpdate = -Infinity,
    corridor,
    cursor;
  const project = new THREE.Vector3(),
    toward = new THREE.Vector3();
  function addMarker(point, text, kind = "route-marker", ahead, action) {
    const element = document.createElement(action ? "button" : "span");
    element.className = `map-marker ${kind}`;
    element.textContent = text;
    if (action) {
      element.type = "button";
      element.onclick = action;
    }
    overlay.appendChild(element);
    const marker = { point, element, ahead };
    markers.push(marker);
    return marker;
  }
  function updateCursor() {
    if (!track || !chart) return;
    const fraction = Number(slider.value) / 1000,
      info = profileAt(chart, fraction),
      position = track.at(track.total * fraction);
    profile.querySelector(".profile-cursor").setAttribute("x1", fraction * 600);
    profile.querySelector(".profile-cursor").setAttribute("x2", fraction * 600);
    output.value = `${formatDistance(info.distance)} from start · ${info.height.toFixed(1)} m`;
    slider.setAttribute("aria-valuetext", output.value);
    if (cursor)
      cursor.point = {
        longitude: position.longitude,
        latitude: position.latitude,
        radius: position.radius,
      };
  }
  slider.addEventListener("input", updateCursor);
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const rect = svg.getBoundingClientRect();
    slider.value = Math.round(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 1000,
    );
    updateCursor();
  });
  function rebuild(state) {
    dirty = false;
    previousResult = state?.result;
    previousSelected = state?.selectedRoute;
    overlay.replaceChildren();
    markers = [];
    cursor = null;
    if (corridor) {
      scene?.remove(corridor);
      corridor.geometry.dispose();
      corridor.material.dispose();
      corridor = null;
    }
    const result = state?.result,
      route = result?.routes.find(
        (route) => route.id === state.selectedRoute && route.status === "ready",
      );
    track = route ? routeTrack(route.points) : null;
    chart = buildRouteProfile(route);
    profile.hidden = !registry.get("route-profile");
    profile.querySelector(".profile-empty").hidden = !!route;
    for (const element of [
      svg,
      slider,
      output,
      profile.querySelector(".profile-axis"),
    ])
      element.toggleAttribute("hidden", !route);
    profile.querySelector(".profile-datum").textContent = chart
      ? chart.datum
      : "";
    if (chart) {
      const span = Math.max(1, chart.max - chart.min),
        points = chart.samples
          .map(
            (sample) =>
              `${((sample.distance / Math.max(1, chart.total)) * 600).toFixed(2)},${(88 - ((sample.height - chart.min) / span) * 76).toFixed(2)}`,
          )
          .join(" ");
      profile.querySelector(".profile-line").setAttribute("points", points);
      profile
        .querySelector(".profile-area")
        .setAttribute(
          "d",
          `M 0 100 L ${points.replaceAll(" ", " L ")} L 600 100 Z`,
        );
      profile.querySelector(".profile-axis").textContent =
        `${Math.round(chart.min)} – ${Math.round(chart.max)} m elevation  ·  ${formatDistance(chart.total)} traveled`;
      if (registry.get("route-profile"))
        cursor = addMarker({}, "◆", "profile-map-cursor");
      if (registry.get("route-endpoints"))
        for (const [index, text] of [
          [0, "START"],
          [route.points.length - 1, "FINISH"],
        ]) {
          const [longitude, latitude, radius] = route.points[index];
          addMarker(
            { longitude, latitude, radius },
            text,
            "route-endpoint-marker",
          );
        }
      if (registry.get("route-distances"))
        for (let i = 1; i < 6; i++) {
          const position = track.at((track.total * i) / 6);
          addMarker(position, formatDistance((track.total * i) / 6));
        }
      if (registry.get("route-directions"))
        for (let i = 1; i < 9; i++) {
          const position = track.at((track.total * i) / 9),
            next = track.at(
              Math.min(
                track.total,
                (track.total * i) / 9 + Math.max(1, track.total * 0.01),
              ),
            );
          addMarker(position, "➤", "route-arrow", next);
        }
      if (registry.get("route-corridor") && scene) {
        const [west, south, east, north] = result.grid.bounds,
          points = [];
        const corners = [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ];
        for (let edge = 0; edge < 4; edge++)
          for (let i = 0; i < 32; i++) {
            const t = i / 32,
              lon = corners[edge][0] * (1 - t) + corners[edge + 1][0] * t,
              lat = corners[edge][1] * (1 - t) + corners[edge + 1][1] * t;
            points.push(
              new THREE.Vector3(
                ...planetPoint(
                  lon,
                  lat,
                  (getRadius(lon, lat) || 3396000) +
                    Math.max(30, result.grid.spacing_m * 0.1),
                ),
              ),
            );
          }
        points.push(points[0].clone());
        corridor = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineDashedMaterial({
            color: 0xb39dfa,
            dashSize: Math.max(0.001, (track.total * SCALE) / 40),
            gapSize: Math.max(0.001, (track.total * SCALE) / 80),
          }),
        );
        corridor.computeLineDistances();
        scene.add(corridor);
      }
      updateCursor();
    }
    if (registry.get("saved-places"))
      for (const pin of getPins())
        addMarker(pin, `◇ ${pin.name}`, "saved-map-pin", null, () =>
          onSelect(pin),
        );
  }
  return {
    refresh() {
      dirty = true;
    },
    update(now) {
      if (now - lastUpdate < 50) return;
      lastUpdate = now;
      const state = getRouteState();
      if (
        dirty ||
        state?.result !== previousResult ||
        state?.selectedRoute !== previousSelected
      )
        rebuild(state);
      altitude.hidden = !registry.get("camera-altitude");
      scale.hidden = true;
      if (registry.get("scale-bar")) {
        const focus = getFocus(),
          radius = focus && getRadius(focus.longitude, focus.latitude);
        if (radius) {
          scaleSphere.radius = radius * SCALE;
          scaleRay.setFromCamera(
            new THREE.Vector2(-100 / innerWidth, 0),
            camera,
          );
          const left = scaleRay.ray.intersectSphere(scaleSphere, scaleLeft);
          scaleRay.setFromCamera(
            new THREE.Vector2(100 / innerWidth, 0),
            camera,
          );
          const right = scaleRay.ray.intersectSphere(scaleSphere, scaleRight);
          if (left && right) {
            const metres = left.distanceTo(right) / SCALE,
              power = 10 ** Math.floor(Math.log10(metres)),
              unit = metres / power;
            const nice = (unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * power;
            if (Number.isFinite(nice) && nice > 0) {
              scale.hidden = false;
              scale.querySelector("span").textContent = formatDistance(nice);
              scale.querySelector("i").style.width =
                `${(nice / metres) * 100}px`;
            }
          }
        }
      }
      if (!altitude.hidden) {
        const radius = camera.position.length() / SCALE,
          latitude =
            (Math.asin(camera.position.y / camera.position.length()) * 180) /
            Math.PI,
          longitude =
            (Math.atan2(-camera.position.z, camera.position.x) * 180) / Math.PI;
        const ground = getRadius(longitude, latitude);
        altitude.value = ground
          ? `${formatDistance(Math.max(0, radius - ground))} above sampled terrain`
          : "Loading altitude…";
      }
      for (const marker of markers) {
        const point = marker.point,
          radius = point.radius || getRadius(point.longitude, point.latitude);
        if (!radius) {
          marker.element.hidden = true;
          continue;
        }
        project.set(
          ...planetPoint(point.longitude, point.latitude, radius + 5),
        );
        // Horizon culling uses the ground radius; annotations do not reveal the far side.
        const visible = project.dot(camera.position) > project.lengthSq();
        project.project(camera);
        marker.element.hidden =
          !visible ||
          project.z < -1 ||
          project.z > 1 ||
          Math.abs(project.x) > 0.96 ||
          Math.abs(project.y) > 0.94;
        if (marker.element.hidden) continue;
        marker.element.style.left = `${((project.x + 1) * innerWidth) / 2}px`;
        marker.element.style.top = `${((1 - project.y) * innerHeight) / 2}px`;
        if (marker.ahead) {
          toward
            .set(
              ...planetPoint(
                marker.ahead.longitude,
                marker.ahead.latitude,
                marker.ahead.radius + 5,
              ),
            )
            .project(camera);
          const angle = Math.atan2(
            -(toward.y - project.y) * innerHeight,
            (toward.x - project.x) * innerWidth,
          );
          marker.element.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
        }
      }
    },
  };
}
