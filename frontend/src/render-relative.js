// Shadow shaders otherwise subtract planet-scale float32 positions while
// resolving sub-meter surfaces. Rebase only for the draw; geographic state and
// camera/navigation coordinates remain unchanged outside this function.
export function renderRelative(renderer, scene, camera) {
  const origin=camera.position.clone(),scenePosition=scene.position.clone();
  scene.position.sub(origin);camera.position.set(0,0,0);
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  try { renderer.render(scene,camera); }
  finally {
    scene.position.copy(scenePosition);camera.position.copy(origin);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  }
}
