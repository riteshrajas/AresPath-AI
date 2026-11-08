// Shadow shaders otherwise subtract planet-scale float32 positions while
// resolving sub-meter surfaces. Rebase only for the draw; geographic state and
// camera/navigation coordinates remain unchanged outside this function.
export function renderRelative(renderer, scene, camera, origin = camera.position) {
  const shift=origin.clone(),scenePosition=scene.position.clone(),cameraPosition=camera.position.clone();
  scene.position.sub(shift);camera.position.sub(shift);
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  try { renderer.render(scene,camera); }
  finally {
    scene.position.copy(scenePosition);camera.position.copy(cameraPosition);
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  }
}
