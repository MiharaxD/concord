// Observes an already authorized audio track; never requests or stops capture.
export class AudioMeter {
  constructor(element, label) { this.element = element; this.label = label; this.generation = 0; }
  async watch(track) {
    this.stop();
    if (!track || track.readyState !== 'live') return;
    const generation = this.generation, context = new AudioContext(); this.context = context;
    try {
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser(), silent = context.createGain();
      analyser.fftSize = 1024; silent.gain.value = 0; source.connect(analyser).connect(silent).connect(context.destination);
      await context.resume();
      if (generation !== this.generation) return;
      const samples = new Float32Array(analyser.fftSize);
      const update = () => {
        if (generation !== this.generation) return;
        if (track.readyState !== 'live') { this.stop(); return; }
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        this.element.value = Math.min(100, rms * 350);
        this.label.textContent = rms > .003 ? 'Áudio detectado' : 'Sem som no momento';
        this.frame = requestAnimationFrame(update);
      };
      update();
    } catch { if (generation === this.generation) { this.stop(); this.label.textContent = 'Medidor indisponível. A transmissão pode continuar.'; } }
  }
  stop() {
    this.generation++; cancelAnimationFrame(this.frame);
    this.context?.close().catch(() => {}); this.context = undefined;
    this.element.value = 0; this.label.textContent = 'O nível aparece ao transmitir.';
  }
}
