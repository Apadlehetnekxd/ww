type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechSession = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
};
type SpeechConstructor = new () => SpeechSession;
type SpeechWindow = Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };

function detectLanguage(text: string, language?: string) {
  if (language) return language;
  if (/[őű]|\b(ez|egy|látható|kérlek|mutasd|képen|nem|felolvasás)\b/i.test(text)) return 'hu-HU';
  if (/\b(the|this|that|visible|please|camera|is|are)\b/i.test(text)) return 'en-US';
  return navigator.language || 'en-US';
}

export class VoiceService {
  private recognition: SpeechSession | null = null;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private speechVersion = 0;

  /** Call directly from a tap/submit, before waiting for an AI response. */
  unlock() {
    this.stopSpeech();
    void new Audio().play().catch(() => undefined);
  }
  static supported() {
    const browser = window as SpeechWindow;
    return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition);
  }
  listen(onText: (text: string) => void, onEnd: () => void, onError: (text: string) => void) {
    this.stop();
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { onError('Voice is unavailable in this browser. You can type your question.'); onEnd(); return; }
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ');
      if (text.trim()) onText(text.trim());
    };
    recognition.onerror = event => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      onError(event.error === 'not-allowed' ? 'Microphone access is off. Allow it in browser settings, or type your question.' : 'Voice could not connect. Try again or type your question.');
    };
    recognition.onend = () => { this.recognition = null; onEnd(); };
    try { recognition.start(); } catch { this.recognition = null; onError('Voice could not start. You can type your question.'); onEnd(); }
  }
  liveListen(onText: (text: string) => void, onState: (active: boolean) => void, onError: (text: string) => void) {
    this.stop();
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { onError('Live voice is unavailable in this browser.'); onState(false); return; }
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
      if (text) onText(text);
    };
    recognition.onerror = event => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      onError(event.error === 'not-allowed' ? 'Microphone access is off. Allow it in browser settings.' : 'Live voice could not connect.');
      onState(false);
    };
    recognition.onend = () => { this.recognition = null; onState(false); };
    try { recognition.start(); onState(true); } catch { this.recognition = null; onError('Live voice could not start.'); onState(false); }
  }
  speak(text: string, onError: (message: string) => void = () => {}, language?: string, reportFailure = true) {
    const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*#`]/g, '').trim();
    if (!clean) return;
    this.stopSpeech();
    const version = this.speechVersion;
    const lang = detectLanguage(clean, language);
    void this.speakNeural(clean, lang, version, onError, reportFailure).then(played => {
      if (!played && reportFailure && version === this.speechVersion) onError('ElevenLabs speech is unavailable. Check ELEVENLABS_API_KEY and try again.');
    });
  }

  private async speakNeural(text: string, language: string, version: number, onError: (message: string) => void, reportFailure: boolean) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 18000);
      const response = await fetch('/api/tts', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });
      window.clearTimeout(timeout);
      if (version !== this.speechVersion || !response.ok) return false;
      const blob = await response.blob();
      if (version !== this.speechVersion || blob.size < 80) return false;
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      const audio = new Audio(url);
      this.audio = audio;
      audio.onended = () => { if (version === this.speechVersion) this.clearAudio(); };
      audio.onerror = () => {
        this.clearAudio();
        if (reportFailure && version === this.speechVersion) onError('ElevenLabs audio could not be played. Try reading the answer aloud again.');
      };
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  private clearAudio() {
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.src = ''; }
    this.audio = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  stopSpeech() {
    this.speechVersion++;
    this.clearAudio();
  }
  stop() {
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.abort();
      this.recognition = null;
    }
    this.stopSpeech();
  }
}
