export class CameraController {
  private stream: MediaStream | null = null;
  private generation = 0;

  private async findUltraWideStream(current: MediaStream, audio: boolean, video: MediaTrackConstraints) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const currentId = current.getVideoTracks()[0]?.getSettings().deviceId;
    const ultraWide = devices.find(device => device.kind === 'videoinput'
      && device.deviceId !== currentId
      && /ultra[ -]?wide|0\.5x|0\.5|wide[ -]?angle/i.test(device.label));
    if (!ultraWide) return current;
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({ video: { ...video, deviceId: { exact: ultraWide.deviceId } }, audio });
      current.getTracks().forEach(track => track.stop());
      return replacement;
    } catch {
      return current;
    }
  }

  async start(video: HTMLVideoElement, microphone = true): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access needs a secure connection. Open Neurix over HTTPS, or use localhost on this computer.');
    }
    const portrait = window.innerHeight >= window.innerWidth;
    const constraints = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      resizeMode: { ideal: 'none' },
      frameRate: { ideal: 60, max: 60 },
    } as MediaTrackConstraints;
    const open = (video: MediaTrackConstraints, audio: boolean) => navigator.mediaDevices.getUserMedia({ video, audio });
    let stream: MediaStream;
    try {
      stream = await open(constraints, microphone);
    } catch (error) {
      if (generation !== this.generation) return;
      const basic: MediaTrackConstraints = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      try { stream = await open(basic, microphone); }
      catch (retry) {
        if (microphone) stream = await open(basic, false);
        else throw retry ?? error;
      }
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = await this.findUltraWideStream(stream, microphone, constraints);
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.stream = stream;
    if (generation !== this.generation) return;
    // Dictation opens its own audio session only after the user chooses voice.
    stream.getAudioTracks().forEach(track => track.stop());
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (generation !== this.generation) return;
    if (!video.videoWidth) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error('The camera did not provide an image. Try opening it again.')); }, 10000);
        const ready = () => { cleanup(); resolve(); };
        const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener('loadeddata', ready); };
        video.addEventListener('loadeddata', ready, { once: true });
      });
    }
  }

  onEnded(callback: () => void) {
    this.stream?.getVideoTracks().forEach(track => { track.onended = callback; });
  }

  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
  }
}

export function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Camera access is off. Allow the camera in your browser’s site settings, then try again.';
    if (error.name === 'NotFoundError') return 'No camera was found. Open Neurix on a device with a camera.';
    if (error.name === 'NotReadableError') return 'The camera is busy. Close the other app using it, then try again.';
  }
  return error instanceof Error ? error.message : 'The camera could not start. Please try again.';
}
