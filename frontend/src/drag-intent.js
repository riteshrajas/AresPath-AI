// Analog drag input with a small dead zone and bounded diagonal speed.
export function dragIntent(dx, dy, radius = 32, deadZone = 3) {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= deadZone) return { x: 0, y: 0 };
  const strength = Math.min(1, (distance - deadZone) / (radius - deadZone));
  return { x: dx / distance * strength, y: dy / distance * strength };
}
