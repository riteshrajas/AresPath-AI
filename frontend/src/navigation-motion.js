import * as THREE from 'three';

// Integrate an exponentially damped velocity exactly over a frame. The same
// one-second press therefore travels the same distance at 30, 60 or 144 Hz.
export function createMotionAxis(response = 12) {
  let velocity = 0;
  return {
    impulse(distance) { velocity += distance * response; },
    advance(target, seconds) {
      const decay = Math.exp(-response * seconds);
      const distance = target * seconds + (velocity - target) * (1 - decay) / response;
      velocity = target + (velocity - target) * decay;
      if (Math.abs(velocity) < 1e-7) velocity = 0;
      return distance;
    },
    stop() { velocity = 0; },
  };
}

// A normal release keeps its brief deceleration. Cancellation must also drop
// velocity; an automatic lost-capture after pointerup is already released.
export function releaseNavigationInput(held, actions, axes, source, cancelled = false) {
  const action = held.get(source);
  held.delete(source);
  if (cancelled && action) axes[actions[action][0]].stop();
}

export function northHeadingRotation(camera, target) {
  // In orbital mode global +Y already defines north. Recentring its longitude
  // would move the explorer to a different place instead of resetting heading.
  if (target.lengthSq() <= 1) return null;
  const offset = camera.position.clone().sub(target);
  const normal = target.clone().normalize(), worldUp = new THREE.Vector3(0, 1, 0);
  const north = worldUp.clone().addScaledVector(normal, -worldUp.dot(normal));
  if (north.lengthSq() < 1e-8) north.set(0, 0, -1).addScaledVector(normal, normal.z);
  north.normalize();
  const radial = THREE.MathUtils.clamp(offset.dot(normal) / offset.length(), -1, 1);
  const destination = normal.multiplyScalar(radial).addScaledVector(north, -Math.sqrt(Math.max(0, 1 - radial * radial))).normalize();
  return new THREE.Quaternion().setFromUnitVectors(offset.normalize(), destination);
}

// OrbitControls 0.173 caches these at construction. Surface travel changes
// camera.up, so its orbit frame must follow before the next controls.update().
export function syncOrbitUp(controls, up) {
  if (controls._quat && controls._quatInverse) {
    controls._quat.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
    controls._quatInverse.copy(controls._quat).invert();
  }
}

export function moveOnPlanet(camera, controls, horizontal, vertical, viewQuaternion = camera.quaternion) {
  if (Math.abs(horizontal) + Math.abs(vertical) < 1e-12) return;
  const local = controls.target.lengthSq() > 1;
  const normal = (local ? controls.target : camera.position).clone().normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(viewQuaternion);
  right.addScaledVector(normal, -right.dot(normal));
  if (right.lengthSq() < 1e-8) {
    right.crossVectors(Math.abs(normal.y) < .99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), normal);
  }
  right.normalize();
  const forward = new THREE.Vector3().crossVectors(normal, right);
  const tangent = right.multiplyScalar(horizontal).addScaledVector(forward, vertical);
  const distance = tangent.length();
  const radius = local ? controls.target.length() : 280;
  const scale = Math.min(.8, camera.position.distanceTo(controls.target) / radius);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(normal, tangent.normalize()).normalize(), distance * scale);
  camera.position.applyQuaternion(rotation); controls.target.applyQuaternion(rotation);
  if (local) { camera.up.applyQuaternion(rotation).normalize(); syncOrbitUp(controls, camera.up); }
}
