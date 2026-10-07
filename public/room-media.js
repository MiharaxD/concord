// One bidirectional WebRTC connection per participant. Failed routes share an
// encoder per publisher and receive authenticated, multiplexed WebM over WSS.
export class RoomMedia {
  constructor({ send, sendBytes, options, player, remove, update, error, fatal }) {
    Object.assign(this, { send, sendBytes, options, player, remove, update, error, fatal });
    this.peers = new Map(); this.members = new Map(); this.receivers = new Map(); this.targets = new Set();
    this.self = ''; this.stream = null; this.recorder = null;
  }
  async roster(self, members) {
    this.self = self;
    const next = new Map(members.map(member => [member.id, member]));
    for (const [id, peer] of this.peers) if (!next.has(id)) {
      clearTimeout(peer.timer); peer.pc?.close(); this.peers.delete(id); this.targets.delete(id); this.resetReceiver(id); this.remove(id);
    }
    this.members = next;
    for (const member of members) {
      if (member.id === self) continue;
      if (!member.stream.active) { this.resetReceiver(member.id); this.remove(member.id); }
      else this.player(member);
      if (!this.peers.has(member.id)) {
        const peer = this.createPeer(member.id);
        if (self < member.id && peer.pc) {
          try { await peer.pc.setLocalDescription(await peer.pc.createOffer()); this.send({ type: 'offer', to: member.id, sdp: peer.pc.localDescription.sdp }); this.flushIce(peer); }
          catch { this.requestRelay(member.id); }
        }
      }
      const peer = this.peers.get(member.id);
      if (member.stream.active) {
        if ((!peer.pc || member.stream.relay) && !this.receivers.has(member.id)) this.requestRelay(member.id);
        if (peer.pc?.connectionState === 'connected' && !this.receivers.has(member.id)) this.directPlayer(member.id);
        else if (!peer.timer && !this.receivers.has(member.id)) peer.timer = setTimeout(() => this.requestRelay(member.id), 9000);
      }
    }
    if (!this.targets.size) this.stopRecorder();
    this.update();
  }
  createPeer(id) {
    const peer = { id, pc: null, ice: [], localIce: [], signalled: false, incoming: new MediaStream(), timer: null };
    this.peers.set(id, peer);
    if (this.options().relay) return peer;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] }); peer.pc = pc;
    if (this.self < id) { pc.addTransceiver('video', { direction: 'sendrecv' }); pc.addTransceiver('audio', { direction: 'sendrecv' }); }
    pc.onicecandidate = event => { if (event.candidate) { if (peer.signalled) this.send({ type: 'ice', to: id, candidate: event.candidate }); else peer.localIce.push(event.candidate); } };
    pc.ontrack = event => {
      peer.incoming.addTrack(event.track); this.directPlayer(id);
      event.track.onunmute = () => this.directPlayer(id);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      if (pc.connectionState === 'connected') { clearTimeout(peer.timer); peer.timer = null; this.directPlayer(id); }
      else if (pc.connectionState === 'failed') { this.requestRelay(id); if (this.stream) this.addTarget(id); }
      else if (pc.connectionState === 'disconnected') { clearTimeout(peer.timer); peer.timer = setTimeout(() => { if (pc.connectionState !== 'connected') this.requestRelay(id); }, 3000); }
    };
    void this.replaceTracks(peer).catch(() => this.requestRelay(id));
    return peer;
  }
  flushIce(peer) { peer.signalled = true; for (const candidate of peer.localIce.splice(0)) this.send({ type: 'ice', to: peer.id, candidate }); }
  async replaceTracks(peer) {
    if (!peer.pc) return;
    for (const transceiver of peer.pc.getTransceivers()) {
      const kind = transceiver.receiver.track.kind;
      await transceiver.sender.replaceTrack(!this.options().relay ? this.stream?.getTracks().find(track => track.kind === kind) || null : null);
      if (kind === 'video' && this.stream) {
        const parameters = transceiver.sender.getParameters(); parameters.encodings ||= [{}];
        if (!parameters.encodings.length) continue;
        parameters.encodings[0].maxBitrate = this.options().bitrate; parameters.encodings[0].maxFramerate = this.options().fps;
        parameters.degradationPreference = 'maintain-resolution'; await transceiver.sender.setParameters(parameters);
      }
    }
  }
  async setStream(stream) {
    this.stream = stream; this.stopRecorder();
    for (const peer of this.peers.values()) {
      await this.replaceTracks(peer).catch(() => { if (stream) this.addTarget(peer.id); });
      if (stream && (this.options().relay || !peer.pc || peer.pc.connectionState === 'failed')) this.targets.add(peer.id);
    }
    if (stream && this.targets.size) this.startRecorder();
    if (!stream) this.targets.clear();
  }
  directPlayer(id) {
    const member = this.members.get(id), peer = this.peers.get(id);
    if (!member?.stream.active || member.stream.relay || !peer || this.receivers.has(id)) return;
    const video = this.player(member);
    if (video.srcObject !== peer.incoming) video.srcObject = peer.incoming;
    video.dataset.transport = 'direct'; this.play(video); this.update();
  }
  requestRelay(id) {
    const peer = this.peers.get(id); if (!peer || !this.members.get(id)?.stream.active) return;
    clearTimeout(peer.timer); peer.timer = null;
    this.send({ type: 'fallback', to: id });
  }
  addTarget(id, restart = false) {
    if (!this.peers.has(id)) return;
    const fresh = !this.targets.has(id); this.targets.add(id);
    if (this.stream && (fresh || restart || !this.recorder)) this.startRecorder();
  }
  async message(msg) {
    const peer = this.peers.get(msg.from);
    if (!peer) return;
    if (msg.type === 'fallback') { this.addTarget(msg.from, Boolean(msg.restart)); return; }
    if (msg.type === 'relay-start') { this.relayPlayer(msg.from, msg.mime); return; }
    if (!peer.pc) { if (msg.type === 'offer') this.send({ type: 'fallback', to: msg.from }); return; }
    const pc = peer.pc;
    if (msg.type === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      for (const transceiver of pc.getTransceivers()) transceiver.direction = 'sendrecv';
      for (const candidate of peer.ice.splice(0)) await pc.addIceCandidate(candidate);
      await this.replaceTracks(peer);
      await pc.setLocalDescription(await pc.createAnswer()); this.send({ type: 'answer', to: msg.from, sdp: pc.localDescription.sdp }); this.flushIce(peer);
    } else if (msg.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); for (const candidate of peer.ice.splice(0)) await pc.addIceCandidate(candidate);
    } else if (msg.type === 'ice') { if (pc.remoteDescription) await pc.addIceCandidate(msg.candidate); else peer.ice.push(msg.candidate); }
  }
  startRecorder() {
    this.stopRecorder(); if (!this.stream || !this.targets.size) return;
    const mime = this.stream.getAudioTracks().length ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mime)) { this.error('Este PC não suporta o modo de compatibilidade.'); return; }
    const recorder = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: this.options().bitrate, audioBitsPerSecond: 128000 }); this.recorder = recorder;
    this.send({ type: 'relay-start', to: [...this.targets], mime });
    recorder.ondataavailable = event => {
      if (this.recorder !== recorder || !event.data.size) return;
      if (!this.sendBytes(event.data)) { this.stopRecorder(); this.fatal('Seu upload não acompanhou a transmissão. Reduza a qualidade ou a taxa de bits.'); }
    };
    recorder.onerror = () => { this.stopRecorder(); this.fatal('O codificador falhou. Tente compartilhar novamente.'); }; recorder.start(250);
  }
  stopRecorder() { const recorder = this.recorder; this.recorder = null; if (recorder) { recorder.ondataavailable = null; recorder.onerror = null; if (recorder.state !== 'inactive') recorder.stop(); } }
  relayPlayer(id, mime) {
    const member = this.members.get(id); if (!member?.stream.active) return;
    if (!MediaSource.isTypeSupported(mime)) { this.error('O formato recebido não é suportado neste PC.'); return; }
    this.resetReceiver(id);
    const video = this.player(member); video.pause(); video.srcObject = null;
    const media = new MediaSource(), url = URL.createObjectURL(media);
    const receiver = { video, media, url, queue: [], bytes: 0, buffer: null }; this.receivers.set(id, receiver);
    video.src = url; video.dataset.transport = 'relay';
    media.addEventListener('sourceopen', () => {
      if (this.receivers.get(id) !== receiver) return;
      try {
        receiver.buffer = media.addSourceBuffer(mime);
        receiver.buffer.addEventListener('updateend', () => this.pump(id));
        receiver.buffer.addEventListener('error', () => this.recover(id)); this.pump(id); this.play(video);
      } catch { this.recover(id); }
    }, { once: true });
    this.update();
  }
  binary(packet) {
    const bytes = new Uint8Array(packet), length = bytes[0]; if (!length || bytes.length <= length + 1) return;
    const id = new TextDecoder().decode(bytes.subarray(1, length + 1)), receiver = this.receivers.get(id); if (!receiver) return;
    const chunk = packet.slice(length + 1); receiver.queue.push(chunk); receiver.bytes += chunk.byteLength;
    if (receiver.bytes > 48 * 1024 * 1024) this.recover(id); else this.pump(id);
  }
  pump(id) {
    const receiver = this.receivers.get(id); if (!receiver?.buffer || receiver.buffer.updating || receiver.media.readyState !== 'open') return;
    const { video, buffer } = receiver;
    try {
      if (buffer.buffered.length) {
        const end = buffer.buffered.end(buffer.buffered.length - 1);
        if (video.currentTime === 0 || end - video.currentTime > 2) video.currentTime = Math.max(buffer.buffered.start(0), end - .5);
        if (video.currentTime > 12 && buffer.buffered.start(0) < video.currentTime - 12) { buffer.remove(0, video.currentTime - 8); return; }
      }
      if (receiver.queue.length) { const chunk = receiver.queue.shift(); receiver.bytes -= chunk.byteLength; buffer.appendBuffer(chunk); }
    } catch { this.recover(id); }
  }
  recover(id) { this.resetReceiver(id); this.send({ type: 'fallback', to: id, restart: true }); }
  resetReceiver(id) {
    const receiver = this.receivers.get(id); if (!receiver) return;
    this.receivers.delete(id); receiver.video.pause(); receiver.video.removeAttribute('src'); receiver.video.load(); URL.revokeObjectURL(receiver.url);
  }
  play(video) { if (video.srcObject || video.getAttribute('src')) video.play().catch(error => { if (error.name === 'NotAllowedError') this.error('Clique em Ativar som para liberar a reprodução.'); }); }
  close() {
    this.stopRecorder(); for (const [id, peer] of this.peers) { clearTimeout(peer.timer); peer.pc?.close(); this.resetReceiver(id); this.remove(id); }
    this.peers.clear(); this.members.clear(); this.targets.clear(); this.stream = null;
  }
}
