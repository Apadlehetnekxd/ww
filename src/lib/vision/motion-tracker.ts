/** Device motion is supporting evidence only. Visual tracking remains authoritative. */
export class MotionTracker {
  alpha: number | null = null;
  beta: number | null = null;
  rotationRate = 0;
  acceleration = 0;

  setOrientation(alpha: number | null, beta: number | null) {
    this.alpha = alpha !== null && Number.isFinite(alpha) ? alpha : null;
    this.beta = beta !== null && Number.isFinite(beta) ? beta : null;
  }

  setMotion(event: DeviceMotionEvent) {
    const rotation = event.rotationRate;
    const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
    this.rotationRate = rotation
      ? Math.hypot(rotation.alpha ?? 0, rotation.beta ?? 0, rotation.gamma ?? 0)
      : 0;
    this.acceleration = acceleration
      ? Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0)
      : 0;
  }
}
