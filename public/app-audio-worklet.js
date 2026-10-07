class AppAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000; this.left = new Float32Array(this.capacity); this.right = new Float32Array(this.capacity);
    this.read = 0; this.write = 0; this.count = 0; this.started = false;
    this.port.onmessage = event => {
      const bytes = event.data;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let offset = 0; offset + 3 < bytes.byteLength; offset += 4) {
        if (this.count === this.capacity) { this.read = (this.read + 1) % this.capacity; this.count--; }
        this.left[this.write] = view.getInt16(offset, true) / 32768;
        this.right[this.write] = view.getInt16(offset + 2, true) / 32768;
        this.write = (this.write + 1) % this.capacity; this.count++;
      }
      // Keep latency bounded even if the renderer briefly stalls.
      if (this.count > 12000) { const drop = this.count - 4800; this.read = (this.read + drop) % this.capacity; this.count -= drop; }
    };
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!this.started && this.count >= 1440) this.started = true;
    for (let index = 0; index < channels[0].length; index++) {
      const available = this.started && this.count > 0;
      channels[0][index] = available ? this.left[this.read] : 0;
      if (channels[1]) channels[1][index] = available ? this.right[this.read] : channels[0][index];
      if (available) { this.read = (this.read + 1) % this.capacity; this.count--; }
    }
    return true;
  }
}
registerProcessor('concord-app-audio', AppAudioProcessor);
