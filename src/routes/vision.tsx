import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight, AudioLines, Check, ExternalLink, LoaderCircle, Mic, Search, Scan, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useVisionSession } from '@/hooks/use-vision-session';
import { VisionSheet } from '@/components/vision/vision-sheet';
import { HandPoints } from '@/components/vision/hand-points';
import { askVision, searchObject, searchWithLens, snapshotFrame, type LensResponse } from '@/lib/vision/ai-service';
import { contains, frameToViewport, viewportToFrame } from '@/lib/vision/coordinates';
import { rankPointingTarget } from '@/lib/vision/scene-memory';
import { frameSignature, usefulViewChange } from '@/lib/vision/frame-change';
import { VoiceService } from '@/lib/vision/voice-service';
import { useAuth } from '@/hooks/use-auth';
import type { VisionObject, VisionTurn } from '@/lib/vision/types';
import '@/styles/vision.css';

export const Route = createFileRoute('/vision')({ component: VisionPage });

type PendingView = { question: string; instruction: string; signature: number[]; attempts: number; object: VisionObject | null };

function VisionPage() {
  const { user, loading: authLoading } = useAuth();
  const session = useVisionSession();
  const { phase, metrics, frame, videoRef, canvasRef, scanImages, depthStatus } = session;
  const stage = useRef<HTMLElement>(null);
  const voice = useRef(new VoiceService());
  const request = useRef<AbortController | null>(null);
  const voiceSubmitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const history = useRef<VisionTurn[]>([]);
  const pending = useRef<PendingView | null>(null);
  const currentFrame = useRef(frame);
  currentFrame.current = frame;
  const [selected, setSelected] = useState<VisionObject | null>(null);
  const [sheet, setSheet] = useState<'object' | 'ask' | null>(null);
  const [tools, setTools] = useState(false);
  const [hint, setHint] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveTalking, setLiveTalking] = useState(false);
  const [followup, setFollowup] = useState('');
  const [allowFollowup, setAllowFollowup] = useState(true);
  const [spoken, setSpoken] = useState(true);
  const [speechError, setSpeechError] = useState('');
  const [lens, setLens] = useState<LensResponse | null>(null);
  const [lensError, setLensError] = useState('');
  const [lensBusy, setLensBusy] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [phoneOnly, setPhoneOnly] = useState<boolean | null>(null);
  const questionDraft = useRef(question);
  const scanAnalyzed = useRef(false);
  const inspectedPointingId = useRef<string | null>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isPhoneUserAgent = /android.*mobile|iphone|ipod|windows phone|blackberry|opera mini|mobile safari/.test(userAgent);
    const isSmallTouchDevice = navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 600px)').matches;
    setPhoneOnly(isPhoneUserAgent || isSmallTouchDevice);
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0].contentRect;
      setViewport({ width: bounds.width, height: bounds.height });
    });
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== 'live') {
      request.current?.abort(); request.current = null;
      voice.current.stop(); pending.current = null; history.current = [];
      setBusy(false); setListening(false); setSheet(null); setTools(false);
      setAnswer(''); setFollowup(''); setSelected(null); scanAnalyzed.current = false;
      return;
    }
    setHint(true);
    const timer = window.setTimeout(() => setHint(false), 5500);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!tools) return;
    const timer = window.setTimeout(() => setTools(false), 7000);
    return () => window.clearTimeout(timer);
  }, [tools]);

  useEffect(() => {
    if (!followup || busy || pending.current) return;
    const timer = window.setTimeout(() => setFollowup(''), 8000);
    return () => window.clearTimeout(timer);
  }, [followup, busy]);

  useEffect(() => () => {
    clearTimeout(voiceSubmitTimer.current);
    request.current?.abort(); voice.current.stop();
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null); voice.current.stop(); setListening(false);
    void videoRef.current?.play().catch(() => undefined);
    // Asking for another view continues in the camera. Other requests can be
    // explicitly stopped using the small contextual stop button.
  }, []);

  const ask = useCallback(async (text: string, object: VisionObject | null, previous?: PendingView) => {
    const video = videoRef.current;
    if (!video || request.current || !text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setQuestionError(''); setFollowup(''); pending.current = null;
    video.pause();
    session.requestAnalysis();
    try {
      const objects = currentFrame.current.objects;
      const latestObject = objects.find(item => item.id === object?.id) ?? object;
      const prompt = previous ? `${text}\nNew view provided in response to: ${previous.instruction}` : text;
      const signature = frameSignature(video);
      const result = await askVision({
        question: prompt,
        image: snapshotFrame(video),
        images: scanImages.current.slice(-5),
        selectedObject: latestObject,
        visibleObjects: objects,
        pointingObject: objects.find(item => item.id === currentFrame.current.selectedId) ?? null,
        history: history.current.slice(-12), signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      history.current = [...history.current, { role: 'user' as const, content: prompt }, { role: 'assistant' as const, content: result.answer }].slice(-16);
      setAnswer(result.answer);
      if (spoken) voice.current.speak(result.needsMoreInfo || result.answer, setSpeechError, undefined, false);
      if (result.needsMoreInfo) {
        const attempts = previous?.attempts ?? 0;
        setFollowup(result.needsMoreInfo);
        if (allowFollowup && attempts < 3) {
          pending.current = { question: text, instruction: result.needsMoreInfo, signature, attempts, object: latestObject };
          setSheet(null);
        } else {
          setQuestion(text); setSheet('ask');
        }
      } else {
        pending.current = null; setFollowup(result.answer); setSheet(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setQuestionError(cause instanceof Error ? cause.message : 'This view could not be analyzed. Please try again.');
        setSheet('ask');
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, [allowFollowup, scanImages, session.requestAnalysis, spoken, videoRef]);

  useEffect(() => {
    if (phase !== 'live' || scanAnalyzed.current || scanImages.current.length < 2) return;
    scanAnalyzed.current = true;
    void ask('Identify every clearly visible object in this completed scan. Put a short label beside each object and mention uncertainty.', null);
  }, [ask, phase, scanImages]);

  useEffect(() => {
    if (phase !== 'live' || !frame.selectedId || inspectedPointingId.current === frame.selectedId) return;
    const object = frame.objects.find(item => item.id === frame.selectedId);
    if (!object || object.id === 'pointing-target') return;
    inspectedPointingId.current = object.id;
    setSelected(object);
    void ask('Identify the object under my fingertip. Return its exact visible name, what it is used for, and concise useful facts. Do not guess if uncertain.', object);
  }, [ask, frame.objects, frame.selectedId, phase]);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = window.setInterval(() => {
      const next = pending.current;
      const video = videoRef.current;
      if (!next || !video || request.current || document.hidden) return;
      if (usefulViewChange(next.signature, frameSignature(video))) {
        pending.current = null;
        void ask(next.question, next.object, { ...next, attempts: next.attempts + 1 });
      }
    }, 1600);
    return () => window.clearInterval(timer);
  }, [ask, phase, videoRef]);

  const stopQuestion = () => {
    clearTimeout(voiceSubmitTimer.current);
    request.current?.abort(); request.current = null;
    pending.current = null; voice.current.stop(); setBusy(false); setListening(false); setFollowup('');
  };

  const openAsk = (object: VisionObject | null = selected, inspect = false) => {
    stopQuestion();
    setSelected(object); setAnswer(''); setQuestionError('');
    setQuestion(inspect ? 'Inspect this object. Describe only what is visible, and ask for another view if needed.' : '');
    setSheet('ask'); setTools(false); setHint(false);
  };

  const onCameraTap = (event: MouseEvent<HTMLButtonElement>) => {
    if (!videoRef.current || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    const point = viewportToFrame({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, videoRef.current, bounds);
    const object = frame.objects.filter(item => contains(item.region, point)).sort((a, b) => a.region.width * a.region.height - b.region.width * b.region.height)[0];
    if (object) { setSelected(object); setSheet('object'); setTools(false); }
    else setTools(value => !value);
    setHint(false); session.requestAnalysis();
  };

  const pointed = frame.objects.find(object => object.id === frame.selectedId);
  const fallbackId = frame.pointing ? rankPointingTarget(frame.pointing, frame.objects, null, videoRef.current && videoRef.current.videoHeight ? videoRef.current.videoWidth / videoRef.current.videoHeight : 1) : null;
  const detectedTarget = pointed ?? frame.objects.find(object => object.id === fallbackId) ?? null;
  const pointingTarget = (() => {
    const handTip = frame.hand?.[8];
    const point = frame.pointing ? { x: frame.pointing.origin.x + frame.pointing.direction.x * 0.42, y: frame.pointing.origin.y + frame.pointing.direction.y * 0.42 } : handTip;
    if (!point) return null;
    const x = Math.max(0.08, Math.min(0.92, point.x));
    const y = Math.max(0.12, Math.min(0.82, point.y));
    return { id: 'pointing-target', type: 'pointed-object', label: detectedTarget?.label && detectedTarget.label !== 'Visible object' ? detectedTarget.label : 'Tap to identify', confidence: detectedTarget?.confidence || 0.25, firstSeen: 0, lastSeen: Date.now(), observations: 1, region: { x: x - 0.09, y: y - 0.09, width: 0.18, height: 0.18 } } satisfies VisionObject;
  })();
  const target = detectedTarget ?? pointingTarget;
  const visibleObjects = frame.objects.length ? frame.objects : (pointingTarget ? [pointingTarget] : []);
  const targetPosition = target && videoRef.current && stage.current
    ? frameToViewport({ x: target.region.x + target.region.width / 2, y: target.region.y + target.region.height / 2 }, videoRef.current, stage.current.getBoundingClientRect()) : null;
  const targetVisible = Boolean(targetPosition && targetPosition.x >= 12 && targetPosition.x <= viewport.width - 12 && targetPosition.y >= 24 && targetPosition.y <= viewport.height - 80);
  const progress = Math.round(metrics.progress * 100);
  const scanning = ['scanning', 'understood', 'revealing'].includes(phase);
  const localHttp = !window.isSecureContext && location.port === '3000';
  const secureCameraUrl = `https://${location.hostname}:3443/vision`;

  const searchCurrentView = async () => {
    const video = videoRef.current;
    if (!video || lensBusy) return;
    setLensBusy(true); setLensError(''); setLens(null);
    try {
      const label = selected?.label || frame.objects[0]?.label;
      setLens(await searchWithLens(snapshotFrame(video, selected?.region), label));
    } catch (error) { setLensError(error instanceof Error ? error.message : 'Visual search is temporarily unavailable.'); }
    finally { setLensBusy(false); }
  };

  const sendCurrentViewToChat = () => {
    const video = videoRef.current;
    if (!video) return;
    const image = snapshotFrame(video);
    window.sessionStorage.setItem('neurix-vision-chat-handoff', JSON.stringify({
      image,
      label: selected?.label || frame.objects[0]?.label || 'camera view',
      question: question.trim() || 'What am I looking at in this image?'
    }));
    window.location.href = '/chat';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault(); setSpeechError('');
    if (spoken) voice.current.unlock();
    setSheet(null); void ask(question, selected);
  };
  const readAloud = () => { setSpeechError(''); voice.current.speak(followup || answer, setSpeechError); };
  const toggleLiveTalking = () => {
    if (liveTalking) { voice.current.stop(); setLiveTalking(false); return; }
    setSpoken(true); setLiveTalking(true); setSpeechError(''); setSheet(null);
    voice.current.liveListen(
      text => { setQuestion(text); void ask(text, selected); },
      active => setLiveTalking(active),
      error => { setSpeechError(error); setLiveTalking(false); },
    );
  };
  const listen = () => {
    if (listening) { voice.current.stop(); setListening(false); return; }
    setSpoken(true); setListening(true); setQuestionError('');
    questionDraft.current = '';
    setQuestion('');
    voice.current.listen(
      text => { questionDraft.current = text; setQuestion(text); },
      () => {
        setListening(false);
        clearTimeout(voiceSubmitTimer.current);
        voiceSubmitTimer.current = setTimeout(() => {
          const text = questionDraft.current.trim();
          if (!text || request.current || busy) return;
          setSpeechError('');
          setSheet(null);
          void ask(text, selected);
        }, 350);
      },
      setQuestionError,
    );
  };

  if (authLoading) {
    return <main className="vision-app vision-auth-gate"><section className="vision-entry"><p>Checking member access…</p></section></main>;
  }

  if (!user) {
    return (
      <main className="vision-app vision-auth-gate">
        <section className="vision-entry" aria-labelledby="vision-member-title">
          <div className="vision-access-badges" aria-label="Vision access status">
            <span>PRIVATE BETA</span>
            <span>MEMBER ONLY</span>
          </div>
          <h1 id="vision-member-title">Neurix Vision is for members.</h1>
          <p className="vision-secondary">Sign in to access the camera, hand tracking, and real-time Vision tools.</p>
          <Link to="/auth" className="vision-primary">Sign in to continue <ArrowUpRight size={17} /></Link>
          <Link to="/" className="vision-back"><ArrowLeft size={12} /> Back to Neurix</Link>
        </section>
      </main>
    );
  }

  if (phoneOnly === false) {
    return (
      <main className="vision-app vision-entry-screen vision-desktop-gate">
        <div className="vision-entry-lidar" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} />)}</div>
        <section className="vision-entry vision-entry-desktop" aria-labelledby="vision-phone-only-title">
          <div className="vision-access-badges"><span>NEURIX VISION</span><span>PHONE EXPERIENCE</span></div>
          <h1 id="vision-phone-only-title">VISION<br /><em>IS PHONE ONLY</em></h1>
          <p className="vision-secondary">Your phone sees more than a screen. Scan the world, ask better questions, and discover what is in front of you.</p>
          <div className="vision-qr-panel"><img className="vision-qr-image" src="/neurix-vision-qr.jpeg" alt="QR code to open Neurix Vision on a phone" /><div><strong>Open Vision on your phone</strong><span>Scan to continue the experience.</span></div></div>
          <Link to="/" className="vision-back"><ArrowLeft size={12} /> Back to Neurix</Link>
        </section>
      </main>
    );
  }

  if (phoneOnly === null) {
    return <main className="vision-app vision-entry-screen"><div className="vision-entry-lidar" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} />)}</div><section className="vision-entry"><p className="vision-kicker">INITIALIZING VISION</p><h1>Reading the room.</h1></section></main>;
  }

  if (phase === 'permission') {
    return <main className="vision-app vision-entry-screen"><video ref={videoRef} className="vision-entry-media" autoPlay playsInline muted aria-hidden="true" /><canvas ref={canvasRef} className="vision-entry-media" aria-hidden="true" /><div className="vision-entry-lidar" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} />)}</div><section className="vision-entry vision-entry-mobile" aria-labelledby="vision-meet-title"><div className="vision-access-badges"><span>NEURIX VISION</span><span>FREE TO EXPLORE</span></div><p className="vision-kicker">MEET VISION</p><h1 id="vision-meet-title">See beyond<br /><em>the obvious.</em></h1><p className="vision-secondary">Point your camera at the world. Vision turns what you see into something you can understand.</p>{localHttp ? <a className="vision-primary" href={secureCameraUrl}>Activate Vision <ArrowUpRight size={17} /></a> : <button type="button" className="vision-primary" onClick={() => void session.start()}>Activate Vision <ArrowUpRight size={17} /></button>}<p className="vision-fine">Camera access stays on this device. Your exploration starts when you choose it.</p><Link to="/" className="vision-back"><ArrowLeft size={12} /> Back to Neurix</Link></section></main>;
  }

  return (
    <main ref={stage} className="vision-app" data-phase={phase} data-depth={depthStatus} aria-label="Neurix Vision">
      <video ref={videoRef} className="vision-video" autoPlay playsInline muted disablePictureInPicture aria-label="Live camera" />
      <canvas ref={canvasRef} className="vision-points" aria-label="Camera-derived point cloud" />
      {(scanning || phase === 'live') && <HandPoints hand={frame.hand ?? null} video={videoRef.current} />}

      {['permission', 'requesting', 'error', 'paused'].includes(phase) && (
        <section className="vision-entry" aria-live="polite">
          {phase === 'permission' && <>
            <div className="vision-access-badges" aria-label="Vision access status">
              <span>PRIVATE BETA</span>
              <span>MEMBER ONLY</span>
            </div>
            <p className="vision-secondary">Neurix needs the camera and microphone to begin scanning.</p>
            {localHttp ? <>
              <a className="vision-primary" href={secureCameraUrl}>Open secure camera <ArrowUpRight size={17} /></a>
              <a className="vision-back" href="/phone.html">First time on this phone? Set up camera access.</a>
            </> : <button className="vision-primary" onClick={() => void session.start()}>Open camera <ArrowUpRight size={17} /></button>}
            <p className="vision-fine">Scanning stays on this device. Voice starts only when you choose it.</p>
            <Link to="/" className="vision-back"><ArrowLeft size={12} /> Back to Neurix</Link>
          </>}
          {phase === 'requesting' && <><p>Waiting for camera access</p><p className="vision-secondary">Allow access in your browser to begin.</p></>}
          {phase === 'error' && <><p>Let’s get your camera ready.</p><p className="vision-secondary">{session.error}</p><button className="vision-primary" onClick={() => void session.start()}>Try again <ArrowUpRight size={17} /></button><Link to="/" className="vision-back">Back to Neurix</Link></>}
          {phase === 'paused' && <><p>Camera paused</p><p className="vision-secondary">Your camera is off. Resume to scan a fresh view.</p><button className="vision-primary" onClick={() => void session.start()}>Resume camera <ArrowUpRight size={17} /></button><Link to="/" className="vision-back">Back to Neurix</Link></>}
        </section>
      )}

      {scanning && <section className="vision-scan-status">
  <p className={`vision-depth-status is-${depthStatus}`} aria-live="polite">{depthStatus === 'available' ? 'LiDAR precision scan active' : depthStatus === 'checking' ? 'Checking depth sensor' : 'Camera depth mode'}</p>
        <p className="vision-status-title" aria-live="polite">{phase === 'scanning' ? 'Scanning environment' : 'Environment understood'}</p>
        <p className="vision-progress-copy">{progress}% complete • {100 - progress}% remaining</p>
        <div className="vision-progress" role="progressbar" aria-label="Environment scan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ transform: `scaleX(${metrics.progress})` }} />
        </div>
        <p className="vision-instruction">{phase === 'scanning' ? metrics.instruction : ' '}</p>
      </section>}

      {phase === 'live' && <>
        <button className="vision-touch-surface" aria-label="Explore camera view" onClick={onCameraTap} />
  {target && targetVisible && <button className={`vision-object-label ${selected?.id === target.id ? 'is-selected' : ''}`} style={{ left: targetPosition.x, top: targetPosition.y }} onClick={() => { setSelected(target); setSheet('object'); }}>
  <span className="vision-object-dot" /><span className="vision-object-line" /><span className="vision-object-name">{target.label && target.label !== 'Visible object' ? target.label : 'Tap to identify'}</span>
  </button>}
  {selected && selected.id !== 'pointing-target' && videoRef.current && stage.current && (() => {
    const region = selected.region;
    const bounds = stage.current.getBoundingClientRect();
    const topLeft = frameToViewport({ x: region.x, y: region.y }, videoRef.current, bounds);
    const bottomRight = frameToViewport({ x: region.x + region.width, y: region.y + region.height }, videoRef.current, bounds);
    return <div className="vision-selection-box" style={{ left: topLeft.x, top: topLeft.y, width: Math.max(44, bottomRight.x - topLeft.x), height: Math.max(44, bottomRight.y - topLeft.y) }} aria-hidden="true"><span className="vision-selection-contour" /><span className="vision-selection-depth" /></div>;
  })()}
  {visibleObjects.filter(object => object.id !== target?.id).map((object) => {
    if (!videoRef.current || !stage.current) return null;
    const position = frameToViewport({ x: object.region.x + object.region.width / 2, y: object.region.y + object.region.height / 2 }, videoRef.current, stage.current.getBoundingClientRect());
    if (position.x < 12 || position.x > viewport.width - 12 || position.y < 24 || position.y > viewport.height - 80) return null;
    return <button key={object.id} className="vision-object-label vision-object-secondary" style={{ left: position.x, top: position.y }} onClick={() => { setSelected(object); setSheet('object'); }}><span className="vision-object-dot" /><span className="vision-object-line" /><span className="vision-object-name">{object.label && object.label !== 'Visible object' ? object.label : 'Tap to identify'}</span></button>;
  })}
        {hint && !tools && !sheet && !busy && !followup && <p className="vision-live-hint">Point at something. Or tap to explore.</p>}
        {tools && !sheet && <div className="vision-context-tools">
          <Link to="/" aria-label="Leave Vision"><ArrowLeft size={18} /></Link>
          <button onClick={() => openAsk(null)}><AudioLines size={18} /> Ask Neurix</button>
          {answer && <button onClick={readAloud} aria-label="Read last answer aloud"><Volume2 size={18} /></button>}
          <button onClick={() => { setTools(false); void session.start(); }} aria-label="Scan again"><Scan size={18} /></button>
        </div>}
        {(busy || followup || speechError) && !sheet && <div className="vision-followup" role="status"><span>{speechError || (busy ? 'Looking at this view…' : followup)}</span>{!busy && (answer || followup) && <button onClick={readAloud} aria-label="Read aloud"><Volume2 size={15} /></button>}<button onClick={() => { stopQuestion(); setFollowup(''); setSpeechError(''); }} aria-label="Dismiss"><X size={15} /></button></div>}
      </>}

      {phase === 'live' && sheet === 'object' && selected && <VisionSheet title={selected.label} onClose={closeSheet}>
        <p className="vision-secondary">Pointed target:<br /><strong>{selected.label}</strong></p>
        <p className="vision-fine">This marker follows the object or hand you point at. Ask Vision to identify it, describe it, or find more about it.</p>
        <div className="vision-object-meta"><Check size={13} /> {selected.observations} observation{selected.observations === 1 ? '' : 's'}</div>
        <div className="vision-sheet-actions">
          <button onClick={() => openAsk(selected)}><AudioLines size={16} /> Ask about this</button>
          <button onClick={() => openAsk(selected, true)}><Scan size={16} /> Inspect</button>
          <a href={searchObject(selected)} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={16} /> Search web</a>
          <button onClick={sendCurrentViewToChat}><Send size={16} /> Send to chat</button>
        </div>
        <p className="vision-fine">Search opens web results for this observed category. Online information is separate from what the camera sees.</p>
      </VisionSheet>}

      {phase === 'live' && sheet === 'ask' && <VisionSheet title={selected ? `About this ${selected.label.toLowerCase()}` : 'Ask about this view'} onClose={closeSheet}>
        {answer && <p className="vision-answer" role="status">{answer}</p>}
        {followup && <p className="vision-secondary">{followup}</p>}
        {questionError && <p className="vision-question-error" role="alert">{questionError}</p>}
        {speechError && <p className="vision-fine" role="status">{speechError}</p>}
        {session.recognitionStatus && <p className="vision-fine">{session.recognitionStatus}</p>}
        <form onSubmit={submit}>
          <div className="vision-sheet-actions">
            <button type="button" onClick={() => void searchCurrentView()} disabled={lensBusy}><Search size={16} /> Search photo</button>
            <button type="button" onClick={sendCurrentViewToChat}><Send size={16} /> Send to chat</button>
          </div>
          {lensBusy && <p className="vision-fine"><LoaderCircle className="vision-spin" size={14} /> Searching visual matches…</p>}
          {lensError && <p className="vision-question-error" role="alert">{lensError}</p>}
          {lens && <div className="vision-lens-results" aria-label="Google Lens results">
            {lens.knowledge?.title && <div className="vision-lens-knowledge"><strong>{lens.knowledge.title}</strong>{lens.knowledge.description && <span>{lens.knowledge.description}</span>}</div>}
            {lens.matches.length === 0 && <p className="vision-fine">No visual matches found.</p>}
            {lens.matches.map((match) => <a className="vision-lens-result" href={match.link} target="_blank" rel="noreferrer" key={match.link}>
              {match.thumbnail && <img src={match.thumbnail} alt="" />}
              <span><strong>{match.title}</strong><small>{match.source || 'Web result'}</small>{match.snippet && <em>{match.snippet}</em>}</span><ExternalLink size={14} />
            </a>)}
          </div>}
          <div className="vision-question-input">
            <textarea aria-label="Your question" placeholder="What am I looking at?" value={question} onChange={event => setQuestion(event.target.value)} rows={2} maxLength={2000} />
            <button type="submit" className="vision-send" disabled={!question.trim() || busy} aria-label="Send view and question"><Send size={17} /></button>
          </div>
          <div className="vision-voice-row"><button type="button" className="vision-voice-button" onClick={listen} aria-pressed={listening}><Mic size={15} />{listening ? 'Listening… tap to stop' : 'Use voice'}</button><button type="button" className={`vision-voice-button ${liveTalking ? 'is-live' : ''}`} onClick={toggleLiveTalking} aria-pressed={liveTalking}><AudioLines size={15} />{liveTalking ? 'Live talking on' : 'Live talking'}</button></div><p className="vision-fine">{liveTalking ? 'Speak naturally. Each finished sentence is sent to Vision.' : 'You can also talk live with Vision.'}</p>
          <div className="vision-voice-row">
            <button type="button" className="vision-voice-button" aria-pressed={spoken} onClick={() => {
              setSpoken(!spoken); setSpeechError('');
              if (spoken) voice.current.stopSpeech();
              else voice.current.speak(navigator.language.startsWith('hu') ? 'Felolvasás bekapcsolva.' : 'Spoken replies are on.', setSpeechError);
            }}>{spoken ? <Volume2 size={15} /> : <VolumeX size={15} />} Read replies aloud</button>
            {answer && <button type="button" className="vision-voice-button" onClick={readAloud}><Volume2 size={15} /> Read aloud</button>}
          </div>
          <p className="vision-fine">Send shares one camera image and your question with the AI provider. Voice uses your browser’s speech service; review the text before sending.</p>
          <label className="vision-followup-consent"><input type="checkbox" checked={allowFollowup} onChange={event => setAllowFollowup(event.target.checked)} /><span>Allow up to 3 new views when this question needs another angle.</span></label>
        </form>
      </VisionSheet>}
    </main>
  );
}
