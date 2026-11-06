import * as THREE from 'three';
import { SCALE } from './globe-math.js';
import { createFreeLook } from './free-look.js';
import { createMotionAxis, moveOnPlanet, releaseNavigationInput, northHeadingRotation } from './navigation-motion.js';
import './navigation.css';
import { dragIntent } from './drag-intent.js';

export function createNavigation(camera, getControls, isFlying, reset) {
  const look = createFreeLook(camera);
  const nav = document.createElement('nav');
  nav.className = 'map-navigation'; nav.setAttribute('aria-label', 'Globe navigation');
  const button = (action, label, content, className = '') => `<button type="button" data-action="${action}" aria-label="${label}" title="${label}" class="${className}">${content}</button>`;
  const pad = (kind, label, icon) => `<div class="drag-control"><span class="drag-label">${label}</span><div class="drag-pad" data-pad="${kind}" tabindex="0" role="group" aria-label="${label}: drag in any direction, or use arrow keys"><span class="pad-axis horizontal"></span><span class="pad-axis vertical"></span><span class="pad-knob">${icon}</span></div><span class="drag-hint">Hold &amp; drag</span></div>`;
  nav.innerHTML = `<div class="navigation-heading"><span>NAVIGATION</span><div class="compass-heading">${button('north', 'Reset heading to north', 'N', 'north-marker')}</div></div>
    ${pad('look', 'LOOK', '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>')}
    ${pad('pan', 'MOVE', '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg>')}
    <div class="navigation-tools">${button('refocus', 'Look back at terrain', '◎')}${button('home', 'Return to Mars overview', '⌂')}</div>
    <div class="navigation-zoom">${button('zoom-in', 'Zoom in', '+')}<input type="range" min="0" max="1000" step="1" value="500" aria-label="Zoom level" orient="vertical">${button('zoom-out', 'Zoom out', '−')}</div>`;
  document.body.appendChild(nav);
  const slider = nav.querySelector('input'), marker = nav.querySelector('.compass-heading');
  const inputs = nav.querySelectorAll('button, input');
  const axes = Object.fromEntries(['lookX', 'lookY', 'panX', 'panY', 'zoom'].map(key => [key, createMotionAxis()]));
  const actions = {
    'look-left': ['lookX', 1], 'look-right': ['lookX', -1],
    'look-up': ['lookY', 1], 'look-down': ['lookY', -1],
    'pan-left': ['panX', -1], 'pan-right': ['panX', 1],
    'pan-up': ['panY', 1], 'pan-down': ['panY', -1],
    'zoom-in': ['zoom', -1], 'zoom-out': ['zoom', 1],
  };
  const held = new Map(), drags = new Map();
  const worldUp = new THREE.Vector3(0, 1, 0), renderedView = camera.quaternion.clone();
  const north = new THREE.Vector3(), normal = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const offset = new THREE.Vector3(), rotation = new THREE.Quaternion();
  let lastTime, wasFlying, desiredDistance = null, northRotation = null;
  let sliderActive = false, resetLook = false, boundControls;

  const stop = () => {
    held.clear();
    for (const [pad] of drags) { pad.classList.remove('dragging'); pad.style.setProperty('--dx', '0px'); pad.style.setProperty('--dy', '0px'); }
    drags.clear();
  };
  function cancelMotion() {
    stop(); Object.values(axes).forEach(axis => axis.stop());
    desiredDistance = null; northRotation = null;
  }
  function bindControls() {
    const controls = getControls();
    if (controls !== boundControls) {
      boundControls?.removeEventListener('start', cancelMotion);
      controls.addEventListener('start', cancelMotion);
      boundControls = controls;
    }
    return controls;
  }
  function northHeading() {
    northRotation = northHeadingRotation(camera, getControls().target);
    resetLook = true;
  }
  function activate(action) {
    if (isFlying()) return;
    if (actions[action]) {
      const [key, sign] = actions[action];
      axes[key].impulse(sign * (key === 'zoom' ? .18 : .09));
      if (key === 'zoom') desiredDistance = null;
      if (key.startsWith('pan')) northRotation = null;
    } else if (action === 'refocus') {
      axes.lookX.stop(); axes.lookY.stop();
      for (const [source, action] of held) if (action.startsWith('look-')) held.delete(source);
      resetLook = true;
    }
    else if (action === 'north') { cancelMotion(); northHeading(); }
    else if (action === 'home') { cancelMotion(); look.reset(); reset(); }
  }
  for (const item of nav.querySelectorAll('button')) {
    const action = item.dataset.action;
    item.addEventListener('pointerdown', event => {
      if (event.button !== 0 || isFlying()) return;
      event.preventDefault(); item.focus();
      item.setPointerCapture(event.pointerId); activate(action);
      if (actions[action]) held.set(`pointer-${event.pointerId}`, action);
    });
    item.addEventListener('pointerup', event => releaseNavigationInput(held, actions, axes, `pointer-${event.pointerId}`));
    const cancel = event => releaseNavigationInput(held, actions, axes, `pointer-${event.pointerId}`, true);
    item.addEventListener('pointercancel', cancel); item.addEventListener('lostpointercapture', cancel);
    item.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || event.repeat || isFlying()) return;
      event.preventDefault(); activate(action);
      if (actions[action]) held.set(`key-${event.key}`, action);
    });
    item.addEventListener('keyup', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); releaseNavigationInput(held, actions, axes, `key-${event.key}`);
    });
    item.addEventListener('blur', () => { for (const key of held.keys()) if (key.startsWith('key-')) releaseNavigationInput(held, actions, axes, key, true); });
    // Screen-reader activation produces a click without a physical pointer.
    item.addEventListener('click', event => { if (event.detail === 0) activate(action); });
  }
  for (const pad of nav.querySelectorAll('.drag-pad')) {
    const kind = pad.dataset.pad, prefix = kind === 'look' ? 'look' : 'pan';
    const end = () => {
      drags.delete(pad); pad.classList.remove('dragging');
      pad.style.setProperty('--dx', '0px'); pad.style.setProperty('--dy', '0px');
      axes[`${prefix}X`].stop(); axes[`${prefix}Y`].stop();
    };
    pad.addEventListener('pointerdown', event => {
      if (event.button !== 0 || isFlying() || drags.has(pad)) return;
      event.preventDefault(); pad.focus(); pad.setPointerCapture(event.pointerId);
      drags.set(pad, { pointer: event.pointerId, x: event.clientX, y: event.clientY, horizontal: 0, vertical: 0 });
      northRotation = null; resetLook = false; pad.classList.add('dragging');
    });
    pad.addEventListener('pointermove', event => {
      const drag = drags.get(pad); if (!drag || drag.pointer !== event.pointerId) return;
      const intent = dragIntent(event.clientX - drag.x, event.clientY - drag.y);
      drag.horizontal = intent.x * (kind === 'look' ? -1 : 1); drag.vertical = -intent.y;
      pad.style.setProperty('--dx', `${intent.x * 24}px`); pad.style.setProperty('--dy', `${intent.y * 24}px`);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, event => { if (drags.get(pad)?.pointer === event.pointerId) end(); });
    const keys = { ArrowLeft: `${prefix}-left`, ArrowRight: `${prefix}-right`, ArrowUp: `${prefix}-up`, ArrowDown: `${prefix}-down` };
    pad.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancelMotion(); end(); return; }
      if (!keys[event.key] || isFlying()) return;
      event.preventDefault(); if (!event.repeat) held.set(`pad-${prefix}-${event.key}`, keys[event.key]);
    });
    pad.addEventListener('keyup', event => { if (keys[event.key]) { event.preventDefault(); releaseNavigationInput(held, actions, axes, `pad-${prefix}-${event.key}`, true); } });
    pad.addEventListener('blur', () => { end(); for (const key of held.keys()) if (key.startsWith(`pad-${prefix}-`)) releaseNavigationInput(held, actions, axes, key, true); });
  }
  addEventListener('blur', cancelMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMotion(); });
  slider.addEventListener('pointerdown', event => { sliderActive = true; slider.setPointerCapture(event.pointerId); });
  const stopSlider = () => { sliderActive = false; };
  slider.addEventListener('pointerup', stopSlider); slider.addEventListener('pointercancel', stopSlider); slider.addEventListener('lostpointercapture', stopSlider); slider.addEventListener('blur', stopSlider);
  slider.addEventListener('input', () => {
    if (isFlying()) return;
    const controls = getControls(); axes.zoom.stop();
    desiredDistance = controls.maxDistance * (controls.minDistance / controls.maxDistance) ** (Number(slider.value) / 1000);
  });

  return {
    beginFrame(now = performance.now()) {
      // Preserve the last rendered heading for movement, then restore the orbit
      // camera before OrbitControls updates it. Free look never moves the anchor.
      renderedView.copy(camera.quaternion); look.beginFrame();
      const controls = bindControls();
      const dt = lastTime === undefined ? 1 / 60 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      controls.dampingFactor = 1 - Math.exp(-3.1 * dt);
      if (isFlying()) { cancelMotion(); look.reset(); resetLook = false; return; }
      const targets = { lookX: 0, lookY: 0, panX: 0, panY: 0, zoom: 0 };
      for (const action of held.values()) { const [key, sign] = actions[action]; targets[key] += sign; }
      for (const [pad, drag] of drags) {
        const prefix = pad.dataset.pad === 'look' ? 'look' : 'pan';
        targets[`${prefix}X`] += drag.horizontal; targets[`${prefix}Y`] += drag.vertical;
      }
      const distance = camera.position.distanceTo(controls.target);
      const lookX = axes.lookX.advance(targets.lookX * 1.1, dt), lookY = axes.lookY.advance(targets.lookY * 1.1, dt);
      if (Math.abs(lookX) + Math.abs(lookY) > 1e-10) resetLook = false;
      look.turn(lookX, lookY);
      if (resetLook) {
        if (look.easeReset(1 - Math.exp(-10 * dt))) resetLook = false;
      }
      moveOnPlanet(camera, controls, axes.panX.advance(targets.panX * .65, dt), axes.panY.advance(targets.panY * .65, dt), renderedView);
      const zoom = axes.zoom.advance(targets.zoom * 1.4, dt);
      let nextDistance = distance * Math.exp(zoom);
      if (desiredDistance !== null) {
        desiredDistance = THREE.MathUtils.clamp(desiredDistance, controls.minDistance, controls.maxDistance);
        nextDistance = Math.exp(THREE.MathUtils.lerp(Math.log(distance), Math.log(desiredDistance), 1 - Math.exp(-14 * dt)));
        if (Math.abs(Math.log(nextDistance / desiredDistance)) < .001) { nextDistance = desiredDistance; desiredDistance = null; }
      }
      nextDistance = THREE.MathUtils.clamp(nextDistance, controls.minDistance, controls.maxDistance);
      if (Math.abs(nextDistance - distance) > 1e-10) {
        offset.copy(camera.position).sub(controls.target).setLength(nextDistance);
        camera.position.copy(controls.target).add(offset);
      }
      if (northRotation) {
        rotation.identity().slerp(northRotation, 1 - Math.exp(-10 * dt));
        offset.copy(camera.position).sub(controls.target).applyQuaternion(rotation);
        camera.position.copy(controls.target).add(offset);
        northRotation.premultiply(rotation.clone().invert());
        if (northRotation.angleTo(new THREE.Quaternion()) < .001) northRotation = null;
      }
    },
    applyView() { look.apply(); },
    update() {
      const controls = getControls(), distance = camera.position.distanceTo(controls.target);
      if (!sliderActive && desiredDistance === null) slider.value = String(THREE.MathUtils.clamp(Math.log(distance / controls.maxDistance) / Math.log(controls.minDistance / controls.maxDistance) * 1000, 0, 1000));
      slider.setAttribute('aria-valuetext', `${Math.round(distance / SCALE)} meters view range`);
      normal.copy(controls.target.lengthSq() > 1 ? controls.target : camera.position).normalize();
      north.copy(worldUp).addScaledVector(normal, -normal.dot(worldUp));
      right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
      marker.style.transform = `rotate(${Math.atan2(north.dot(right), north.dot(up))}rad)`;
      const flying = isFlying();
      if (wasFlying !== flying) { for (const item of inputs) item.disabled = flying; wasFlying = flying; }
    },
  };
}
