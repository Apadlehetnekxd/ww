import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraController, cameraError } from '@/lib/vision/camera-controller';
import { MotionTracker } from '@/lib/vision/motion-tracker';
import { ScanEngine } from '@/lib/vision/scan-engine';
import { RecognitionController } from '@/lib/vision/recognition';
import type { RecognitionFrame, ScanMetrics } from '@/lib/vision/types';

export type VisionPhase = 'permission' | 'requesting' | 'scanning' | 'understood' | 'revealing' | 'live' | 'paused' | 'error';
const initialMetrics: ScanMetrics = {
  scanConfidence: 0, sceneCoverage: 0, viewpointCoverage: 0, featureStability: 0,
  objectCoverage: 0, progress: 0, complete: false, instruction: 'Move slowly around the room.', stablePoints: 0,
};
const emptyFrame: RecognitionFrame = { objects: [], pointing: null, selectedId: null };
type OrientationPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };

export function useVisionSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useRef(new CameraController());
  const motion = useRef(new MotionTracker());
  const scanner = useRef<ScanEngine | null>(null);
  const recognition = useRef<RecognitionController | null>(null);
  const generation = useRef(0);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<VisionPhase>('permission');
  const [phase, setPhase] = useState<VisionPhase>('permission');
  const [metrics, setMetrics] = useState(initialMetrics);
  const [frame, setFrame] = useState(emptyFrame);
  const [error, setError] = useState('');
  const [recognitionStatus, setRecognitionStatus] = useState('');

  const changePhase = useCallback((next: VisionPhase) => { phaseRef.current = next; setPhase(next); }, []);
  const release = useCallback(() => {
    generation.current++;
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current = [];
    scanner.current?.stop(); scanner.current = null;
    recognition.current?.stop(); recognition.current = null;
    camera.current.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || phaseRef.current === 'requesting') return;
    release();
    const version = generation.current;
    setError(''); setFrame(emptyFrame); setMetrics(initialMetrics); setRecognitionStatus('');
    changePhase('requesting');
    // iOS motion permission must be requested directly inside this user gesture.
    const orientation = window.DeviceOrientationEvent as OrientationPermission | undefined;
    const motionApi = window.DeviceMotionEvent as (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }) | undefined;
    if (typeof orientation?.requestPermission === 'function') void orientation.requestPermission().catch(() => undefined);
    if (typeof motionApi?.requestPermission === 'function') void motionApi.requestPermission().catch(() => undefined);
    try {
      const video = videoRef.current;
      await camera.current.start(video);
      if (version !== generation.current) return;
      const scan = new ScanEngine(video, canvasRef.current, value => {
        if (version !== generation.current) return;
        setMetrics(value);
        if (value.complete && phaseRef.current === 'scanning') {
          changePhase('understood');
          if (navigator.vibrate) navigator.vibrate(12);
          timers.current.push(window.setTimeout(() => {
            if (version !== generation.current) return;
            changePhase('revealing');
            timers.current.push(window.setTimeout(() => {
              if (version !== generation.current) return;
              changePhase('live');
            }, 550));
          }, 550));
        }
      });
      scanner.current = scan;
      await scan.start();
      if (version !== generation.current) { scan.stop(); return; }
      changePhase('scanning');
      const detector = new RecognitionController(video, next => {
        if (version !== generation.current) return;
        setFrame(next);
        const observed = next.objects.filter(object => object.observations >= 2);
        const coverage = Math.min(1, observed.reduce((sum, object) => sum + object.confidence, 0) / 4);
        scanner.current?.setObjectCoverage(coverage);
      }, message => { if (version === generation.current) setRecognitionStatus(message); });
      recognition.current = detector;
      void detector.start().catch(() => {
        if (version === generation.current) setRecognitionStatus('Object recognition is unavailable. You can still ask about the camera view.');
      });
      camera.current.onEnded(() => {
        if (version !== generation.current) return;
        release(); setFrame(emptyFrame); changePhase('paused');
      });
    } catch (cause) {
      if (version !== generation.current) return;
      release(); setError(cameraError(cause)); changePhase('error');
    }
  }, [changePhase, release]);

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      motion.current.setOrientation(event.alpha, event.beta);
      scanner.current?.setOrientation(motion.current.alpha, motion.current.beta);
    };
    const onMotion = (event: DeviceMotionEvent) => {
      motion.current.setMotion(event);
      scanner.current?.setInertialMotion(motion.current.rotationRate, motion.current.acceleration);
    };
    const pause = () => {
      if (['permission', 'paused', 'error'].includes(phaseRef.current)) return;
      release(); setFrame(emptyFrame); changePhase('paused');
    };
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pause);
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    const previousBackground = document.documentElement.style.background;
    const previousOverflow = document.body.style.overflow;
    document.documentElement.style.background = '#000';
    document.body.style.overflow = 'hidden';
    const theme = document.querySelector('meta[name="theme-color"]');
    const previousTheme = theme?.getAttribute('content');
    theme?.setAttribute('content', '#000000');
    const previousTitle = document.title;
    document.title = 'Neurix Vision';
    return () => {
      release();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
      document.documentElement.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
      if (previousTheme) theme?.setAttribute('content', previousTheme);
      document.title = previousTitle;
    };
  }, [changePhase, release]);

  const requestAnalysis = useCallback(() => recognition.current?.requestAnalysis(), []);
  return { videoRef, canvasRef, phase, metrics, frame, error, recognitionStatus, start, requestAnalysis };
}
