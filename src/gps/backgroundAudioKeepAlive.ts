// Background Media Keep-Alive for iOS Safari & Mobile Browsers
// iOS Safari suspends WebKit tabs when the device screen locks.
// To keep GPS watchPosition and network transmission active in the background,
// an HTML5 Audio element with an active MediaSession is used.

class BackgroundMediaKeepAlive {
  private audioElement: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private isRunning: boolean = false;

  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      // 1. Create native HTML5 Audio element playing looping silent audio
      if (!this.audioElement) {
        this.audioElement = new Audio('/silent.wav');
        this.audioElement.loop = true;
        this.audioElement.autoplay = true;
        this.audioElement.setAttribute('playsinline', 'true');
        this.audioElement.setAttribute('webkit-playsinline', 'true');
        // Very low volume (imperceptible, but not 0 so iOS audio session stays active)
        this.audioElement.volume = 0.01;
      }

      await this.audioElement.play().catch((e) => {
        console.warn('[KeepAlive] Audio element play deferred or blocked:', e);
      });

      // 2. Configure iOS Lock Screen MediaSession API
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '[SAT-UPLINK ACTIVE]',
          artist: 'Cloud Command Center',
          album: 'Orbital GPS Stream • 1575.42 MHz',
        });
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
          this.audioElement?.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Re-play to prevent accidental pause from iOS lock screen widget
          this.audioElement?.play().catch(() => {});
        });
      }

      // 3. Auxiliary Web Audio Context fallback
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
          this.oscillator = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          gain.gain.value = 0.00001;
          this.oscillator.connect(gain);
          gain.connect(this.audioCtx.destination);
          this.oscillator.start();
        }
      } catch {}

      this.isRunning = true;
      console.log('[KeepAlive] Background MediaSession active and running');
      return true;
    } catch (err) {
      console.warn('[KeepAlive] Failed to start background media:', err);
      return false;
    }
  }

  public stop(): void {
    if (!this.isRunning) return;

    try {
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {});
      }
    } catch {}

    this.audioElement = null;
    this.oscillator = null;
    this.audioCtx = null;
    this.isRunning = false;
    console.log('[KeepAlive] Background MediaSession stopped');
  }

  public resumeIfPaused(): void {
    if (this.isRunning) {
      if (this.audioElement && this.audioElement.paused) {
        this.audioElement.play().catch(() => {});
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    }
  }
}

export const backgroundMedia = new BackgroundMediaKeepAlive();
