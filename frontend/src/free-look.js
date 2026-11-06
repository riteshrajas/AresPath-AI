import * as THREE from 'three';

// Keep the surface navigation anchor separate from the viewing direction.
// OrbitControls owns position; this rotation lets the camera face empty sky.
export function createFreeLook(camera) {
  const base = new THREE.Quaternion(), offset = new THREE.Quaternion();
  const angles = new THREE.Euler(0, 0, 0, 'YXZ');
  let applied = false, pitch = 0, yaw = 0;
  return {
    turn(horizontal, vertical) {
      yaw = THREE.MathUtils.euclideanModulo(yaw + horizontal + Math.PI, 2 * Math.PI) - Math.PI;
      pitch = THREE.MathUtils.clamp(pitch + vertical, -Math.PI, Math.PI);
    },
    reset() { pitch = yaw = 0; },
    easeReset(amount) {
      pitch *= 1 - amount; yaw *= 1 - amount;
      if (Math.abs(pitch) + Math.abs(yaw) < .0001) { pitch = yaw = 0; return true; }
      return false;
    },
    beginFrame() {
      if (applied) { camera.quaternion.copy(base); camera.updateMatrixWorld(true); applied = false; }
    },
    apply() {
      if (applied) camera.quaternion.copy(base);
      base.copy(camera.quaternion);
      angles.set(pitch, yaw, 0, 'YXZ'); offset.setFromEuler(angles);
      camera.quaternion.multiply(offset); camera.updateMatrixWorld(true); applied = true;
    },
  };
}
