// One bidirectional WebRTC connection per participant. Failed routes share an
// encoder per publisher and receive authenticated, multiplexed WebM over WSS.
// 0.7.0+: a third transceiver (and a second encoder) carries the camera, keyed
// as `<id>:camera`; it is only negotiated with members that announce the feature.
const CAMERA_BITRATE = 1500000;
export class RoomMedia {
  constructor({ send, sendBytes, options, player, cameraPlayer = () => null, removeCamera = () => {}, remove, update, error, fatal, compatibility = () => {} }) {
    Object.assign(this, { send, sendBytes, options, player, cameraPlayer, removeCamera, remove, update, error, fatal, compatibility });
    this.peers = new Map(); this.members = new Map(); this.receivers = new Map(); this.targets = new Set();
    this.self = ''; this.stream = null; this.camera = null; this.recorders = [];
  }
  relaying(id) { return this.receivers.has(id) || this.receivers.has(id + ':camera'); }
  async roster(self, members) {
    this.self = self;
    const next = new Map(members.map(member => [member.id, member]));
    for (const [id, peer] of this.peers) if (!next.has(id)) {
      clearTimeout(peer.timer); peer.pc?.close(); this.peers.delete(id); this.targets.delete(id);
      this.resetReceiver(id); this.resetReceiver(id + ':camera'); this.removeCamera(id); this.remove(id);
    }
    this.members = next;
    for (const member of members) {
      if (member.id === self) continue;
      if (!member.stream.active) { this.resetReceiver(member.id); this.remove(member.id); }
      else this.player(member);
      if (!member.stream.camera) { this.resetReceiver(member.id + ':camera'); this.removeCamera(member.id); }
      if (!this.peers.has(member.id)) {
        const peer = this.createPeer(member.id);
        if (self < member.id && peer.pc) {
          try { await peer.pc.setLocalDescription(await peer.pc.createOffer()); this.send({ type: 'offer', to: member.id, sdp: peer.pc.localDescription.sdp }); this.flushIce(peer); }
          catch { this.requestRelay(member.id); }
        }
      }
      const peer = this.peers.get(member.id);
      if (member.stream.active) {
        const connected = peer.pc?.connectionState === 'connected';
        if ((!peer.pc || member.stream.relay) && !this.relaying(member.id)) this.requestRelay(member.id);
        if (connected) { this.directPlayer(member.id); this.directCamera(member.id); }
        else if (!peer.timer && !this.relaying(member.id)) peer.timer = setTimeout(() => this.requestRelay(member.id), 9000);
      }
    }
    if (!this.targets.size) this.stopRecorder();
    this.update();
  }
  cameraLink(id) { return this.members.get(id)?.features?.includes('camera'); }
  createPeer(id) {
    const peer = { id, pc: null, ice: [], localIce: [], signalled: false, incoming: new MediaStream(), cameraIncoming: new MediaStream(), timer: null };
    this.peers.set(id, peer);
    if (this.options().relay) return peer;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] }); peer.pc = pc;
    if (this.self < id) {
      pc.addTransceiver('video', { direction: 'sendrecv' }); pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (this.cameraLink(id)) pc.addTransceiver('video', { direction: 'sendrecv' });
    }
    pc.onicecandidate = event => { if (event.candidate) { if (peer.signalled) this.send({ type: 'ice', to: id, candidate: event.candidate }); else peer.localIce.push(event.candidate); } };
    pc.ontrack = event => {
      // m-line order is fixed by the offerer: screen video, audio, camera video.
      const camera = pc.getTransceivers().indexOf(event.transceiver) === 2;
      const show = () => camera ? this.directCamera(id) : this.directPlayer(id);
      (camera ? peer.cameraIncoming : peer.incoming).addTrack(event.track); show();
      event.track.onunmute = show;
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      if (pc.connectionState === 'connected') { clearTimeout(peer.timer); peer.timer = null; this.directPlayer(id); this.directCamera(id); }
      else if (pc.connectionState === 'failed') { this.requestRelay(id); if (this.stream || this.camera) this.addTarget(id); }
      else if (pc.connectionState === 'disconnected') { clearTimeout(peer.timer); peer.timer = setTimeout(() => { if (pc.connectionState !== 'connected') this.requestRelay(id); }, 3000); }
    };
    void this.replaceTracks(peer).catch(() => this.requestRelay(id));
    return peer;
  }
  flushIce(peer) { peer.signalled = true; for (const candidate of peer.localIce.splice(0)) this.send({ type: 'ice', to: peer.id, candidate }); }
  async replaceTracks(peer) {
    if (!peer.pc) return;
    const relay = this.options().relay;
    for (const [index, transceiver] of peer.pc.getTransceivers().entries()) {
      const track = relay ? null : index === 0 ? this.stream?.getVideoTracks()[0] : index === 1 ? this.stream?.getAudioTracks()[0] : index === 2 ? this.camera : null;
      await transceiver.sender.replaceTrack(track || null);
      if (!track || index === 1) continue;
      const parameters = transceiver.sender.getParameters(); parameters.encodings ||= [{}];
      if (!parameters.encodings.length) continue;
      parameters.encodings[0].maxBitrate = index === 2 ? CAMERA_BITRATE : this.options().bitrate;
      parameters.encodings[0].maxFramerate = index === 2 ? 30 : this.options().fps;
      parameters.degradationPreference = index === 2 ? 'balanced' : 'maintain-resolution'; await transceiver.sender.setParameters(parameters);
    }
  }
  // Peers without a direct route (or without the camera transceiver) get the relay.
  async publish(addTargets) {
    this.stopRecorder();
    for (const peer of this.peers.values()) {
      await this.replaceTracks(peer).catch(() => { if (this.stream || this.camera) this.addTarget(peer.id); });
      if (addTargets(peer)) this.targets.add(peer.id);
    }
    if ((this.stream || this.camera) && this.targets.size) this.startRecorder();
    if (!this.stream && !this.camera) this.targets.clear();
  }
  async setStream(stream) {
    this.stream = stream;
    await this.publish(peer => stream && (this.options().relay || !peer.pc || peer.pc.connectionState === 'failed'));
  }
  async setCamera(track) {
    this.camera = track;
    await this.publish(peer => track && this.cameraLink(peer.id) && (this.options().relay || !peer.pc || peer.pc.connectionState === 'failed' || peer.pc.getTransceivers().length < 3));
  }
  directPlayer(id) {
    const member = this.members.get(id), peer = this.peers.get(id);
    if (!member?.stream.active || member.stream.screen === false || member.stream.relay || !peer || this.receivers.has(id)) return;
    const video = this.player(member);
    if (video.srcObject !== peer.incoming) video.srcObject = peer.incoming;
    video.dataset.transport = 'direct'; this.play(video); this.update();
  }
  directCamera(id) {
    const member = this.members.get(id), peer = this.peers.get(id);
    if (!member?.stream.camera || member.stream.relay || !peer?.pc || peer.pc.getTransceivers().length < 3 || this.receivers.has(id + ':camera')) return;
    const video = this.cameraPlayer(member); if (!video) return;
    if (video.srcObject !== peer.cameraIncoming) video.srcObject = peer.cameraIncoming;
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
    if (fresh && (this.stream || this.camera)) this.compatibility();
    if ((this.stream || this.camera) && (fresh || restart || !this.recorders.length)) this.startRecorder();
  }
  async message(msg) {
    const peer = this.peers.get(msg.from);
    if (!peer) return;
    if (msg.type === 'fallback') { this.addTarget(msg.from, Boolean(msg.restart)); return; }
    if (msg.type === 'relay-start') { this.relayPlayer(msg.from, msg.mime, msg.stream === 'camera'); return; }
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
    this.stopRecorder(); if (!this.targets.size) return;
    if (this.stream) this.record(this.stream, 'screen');
    // Only members that understand the camera stream receive its encoder.
    const cameraTargets = [...this.targets].filter(id => this.cameraLink(id));
    if (this.camera && cameraTargets.length) this.record(new MediaStream([this.camera]), 'camera', cameraTargets);
  }
  record(stream, kind, targets = [...this.targets]) {
    const mime = stream.getAudioTracks().length ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mime)) { this.error('Este PC não suporta o modo de compatibilidade.'); return; }
    const camera = kind === 'camera';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: camera ? CAMERA_BITRATE : this.options().bitrate, audioBitsPerSecond: 128000 });
    this.recorders.push(recorder);
    this.send({ type: 'relay-start', to: targets, mime, ...(camera ? { stream: 'camera' } : {}) });
    recorder.ondataavailable = event => {
      if (!this.recorders.includes(recorder) || !event.data.size) return;
      if (!this.sendBytes(event.data, kind)) { this.stopRecorder(); this.fatal('Seu upload não acompanhou a transmissão. Reduza a qualidade ou a taxa de bits.'); }
    };
    recorder.onerror = () => { this.stopRecorder(); this.fatal('O codificador falhou. Tente compartilhar novamente.'); }; recorder.start(250);
  }
  stopRecorder() {
    for (const recorder of this.recorders.splice(0)) { recorder.ondataavailable = null; recorder.onerror = null; if (recorder.state !== 'inactive') recorder.stop(); }
  }
  get recorder() { return this.recorders[0] || null; }
  relayPlayer(id, mime, camera = false) {
    const member = this.members.get(id), key = camera ? id + ':camera' : id;
    if (!member?.stream.active || (camera && !member.stream.camera)) return;
    if (!MediaSource.isTypeSupported(mime)) { this.error('O formato recebido não é suportado neste PC.'); return; }
    const video = camera ? this.cameraPlayer(member) : this.player(member); if (!video) return;
    this.compatibility();
    this.resetReceiver(key);
    video.pause(); video.srcObject = null;
    const media = new MediaSource(), url = URL.createObjectURL(media);
    const receiver = { video, media, url, queue: [], bytes: 0, buffer: null }; this.receivers.set(key, receiver);
    video.src = url; video.dataset.transport = 'relay';
    media.addEventListener('sourceopen', () => {
      if (this.receivers.get(key) !== receiver) return;
      try {
        receiver.buffer = media.addSourceBuffer(mime);
        receiver.buffer.addEventListener('updateend', () => this.pump(key));
        receiver.buffer.addEventListener('error', () => this.recover(key)); this.pump(key); this.play(video);
      } catch { this.recover(key); }
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
  recover(key) { this.resetReceiver(key); this.send({ type: 'fallback', to: key.split(':')[0], restart: true }); }
  resetReceiver(key) {
    const receiver = this.receivers.get(key); if (!receiver) return;
    this.receivers.delete(key); receiver.video.pause(); receiver.video.removeAttribute('src'); receiver.video.load(); URL.revokeObjectURL(receiver.url);
  }
  play(video) { if (video.srcObject || video.getAttribute('src')) video.play().catch(error => { if (error.name === 'NotAllowedError') this.error('Clique em Ativar som para liberar a reprodução.'); }); }
  close() {
    this.stopRecorder();
    for (const [id, peer] of this.peers) { clearTimeout(peer.timer); peer.pc?.close(); this.resetReceiver(id); this.resetReceiver(id + ':camera'); this.removeCamera(id); this.remove(id); }
    this.peers.clear(); this.members.clear(); this.targets.clear(); this.stream = null; this.camera = null;
  }
}
