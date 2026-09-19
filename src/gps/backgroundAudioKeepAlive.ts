// Background Audio Keep-Alive for iOS Safari
// iOS Safari suspends WebKit tabs and geolocation when the phone sleeps
// unless an audio context or HTML5 audio playback is active.
// This utility creates an imperceptible, silent audio loop to keep the process alive in the background.

class BackgroundAudioKeepAlive {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning: boolean = false;

  public start(): boolean {
    if (this.isRunning) return true;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      this.audioCtx = new AudioCtx();

      // Create an oscillator with frequency below human threshold or near-zero gain
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      // Inaudible gain (silent)
      this.gainNode.gain.value = 0.00001;

      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 440; // standard A4 but attenuated to silence

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();
      this.isRunning = true;

      // Resume context if suspended
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      console.log('[KeepAlive] Background audio session active');
      return true;
    } catch (err) {
      console.warn('[KeepAlive] Failed to start background audio:', err);
      return false;
    }
  }

  public stop(): void {
    if (!this.isRunning) return;

    try {
      this.oscillator?.stop();
      this.oscillator?.disconnect();
      this.gainNode?.disconnect();
      this.audioCtx?.close();
    } catch {}

    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isRunning = false;
    console.log('[KeepAlive] Background audio session stopped');
  }

  public resumeIfSuspended(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }
}

export const backgroundAudio = new BackgroundAudioKeepAlive();
