// Direct room access without a tunnel: public MQTT brokers carry encrypted
// WebRTC offers, and a DataChannel carries the existing room protocol to the
// host, which bridges it to its loopback server. Cloudflare is only a fallback.
import { MqttRelay } from './mqtt.js';

export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const encoder = new TextEncoder(), decoder = new TextDecoder();
const CHUNK = 64 * 1024, MAX_MESSAGE = 8 * 1024 * 1024, MAX_SIGNAL = 64 * 1024, CLOCK_SKEW = 5 * 60 * 1000;
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const randomId = () => hex(crypto.getRandomValues(new Uint8Array(12)));
const guestId = /^[0-9a-f]{24}$/;

export async function roomChannel(key) {
  const topic = await crypto.subtle.digest('SHA-256', encoder.encode('concord-p2p-topic:' + key));
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode('concord-p2p-key:' + key));
  return { topic: 'concord/v1/' + hex(topic).slice(0, 40), aes: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}
export async function seal(aes, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, encoder.encode(JSON.stringify(value))));
  const out = new Uint8Array(12 + data.length); out.set(iv); out.set(data, 12); return out;
}
export async function unseal(aes, bytes) {
  if (bytes.length < 29 || bytes.length > MAX_SIGNAL) throw new Error('Mensagem inválida.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, aes, bytes.subarray(12));
  return JSON.parse(decoder.decode(plain));
}

// kind: 0 text, 1 binary, 2 close (code + reason). 0x80 marks more fragments.
export function frames(kind, bytes) {
  const out = []; let offset = 0;
  do {
    const part = bytes.subarray(offset, offset + CHUNK), more = offset + CHUNK < bytes.length, frame = new Uint8Array(part.length + 1);
    frame[0] = kind | (more ? 0x80 : 0); frame.set(part, 1); out.push(frame); offset += CHUNK;
  } while (offset < bytes.length);
  return out;
}
export class Reassembler {
  constructor() { this.parts = []; this.size = 0; }
  push(frame) {
    if (!frame.length) throw new Error('Quadro vazio.');
    this.parts.push(frame.subarray(1)); this.size += frame.length - 1;
    if (this.size > MAX_MESSAGE) throw new Error('Mensagem muito grande.');
    if (frame[0] & 0x80) return null;
    const bytes = new Uint8Array(this.size); let offset = 0;
    for (const part of this.parts) { bytes.set(part, offset); offset += part.length; }
    this.parts = []; this.size = 0;
    return { kind: frame[0] & 0x7f, bytes };
  }
}
const closeFrame = (code, reason) => { const text = encoder.encode(String(reason || '').slice(0, 120)); const bytes = new Uint8Array(text.length + 2); bytes[0] = code >> 8; bytes[1] = code & 255; bytes.set(text, 2); return frames(2, bytes); };

export class Signal {
  static async create(key, onMessage, { brokers = BROKERS, relay = (url, handlers) => new MqttRelay(url, handlers), onState = () => {} } = {}) {
    const { topic, aes } = await roomChannel(key);
    return new Signal(topic, aes, onMessage, brokers, relay, onState);
  }
  constructor(topic, aes, onMessage, brokers, relay, onState) {
    Object.assign(this, { topic, aes, onMessage, onState });
    this.seen = new Set(); this.closed = false; this.connected = new Set(); this.waiters = [];
    this.relays = brokers.map(url => {
      const item = relay(url, {
        onState: ready => {
          if (ready) this.connected.add(item); else this.connected.delete(item);
          if (ready) for (const resolve of this.waiters.splice(0)) resolve(true);
          this.onState(this.connected.size);
        },
        onMessage: (name, payload) => { if (name === this.topic) void this.receive(payload); }
      });
      item.subscribe(topic); return item;
    });
  }
  async receive(payload) {
    let msg;
    try { msg = await unseal(this.aes, payload); } catch { return; }
    if (this.closed || !msg || typeof msg.id !== 'string' || msg.id.length > 64 || this.seen.has(msg.id) || Math.abs(Date.now() - Number(msg.ts)) > CLOCK_SKEW) return;
    this.seen.add(msg.id); if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value);
    this.onMessage(msg);
  }
  ready(timeout = 10000) {
    if (this.connected.size) return Promise.resolve(true);
    return new Promise(resolve => { this.waiters.push(resolve); setTimeout(() => resolve(this.connected.size > 0), timeout); });
  }
  async send(msg) {
    if (this.closed) return false;
    const payload = await seal(this.aes, { ...msg, id: randomId(), ts: Date.now() });
    let sent = false; for (const relay of this.relays) sent = relay.publish(this.topic, payload) || sent;
    return sent;
  }
  close() { this.closed = true; for (const relay of this.relays) relay.close(); for (const resolve of this.waiters.splice(0)) resolve(false); }
}

function gathered(pc, timeout = 4000) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(() => done(), timeout);
    function done() { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// WebSocket-shaped wrapper used by app.js for either a DataChannel or the fallback WebSocket.
export class RoomSocket {
  constructor() { this.readyState = 0; this.binaryType = 'arraybuffer'; this.route = ''; this.chain = Promise.resolve(); }
  get bufferedAmount() { return (this.channel || this.ws)?.bufferedAmount || 0; }
  attachChannel(channel, pc) {
    if (this.readyState > 1) { pc.close(); return; }
    this.channel = channel; this.pc = pc; this.route = 'direct'; channel.binaryType = 'arraybuffer';
    const reader = new Reassembler();
    const opened = () => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.({}); } };
    channel.onmessage = event => {
      let message;
      try { message = reader.push(new Uint8Array(event.data)); } catch { this.finish(1009, 'Mensagem muito grande'); return; }
      if (!message) return;
      if (message.kind === 2) this.finish((message.bytes[0] << 8) | message.bytes[1], decoder.decode(message.bytes.subarray(2)));
      else this.onmessage?.({ data: message.kind ? message.bytes.buffer : decoder.decode(message.bytes) });
    };
    channel.onclose = () => this.finish(1006, '');
    pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) this.finish(1006, ''); });
    if (channel.readyState === 'open') opened(); else channel.onopen = opened;
  }
  attachSocket(ws) {
    if (this.readyState > 1) { ws.close(); return; }
    this.ws = ws; this.route = 'tunnel'; ws.binaryType = 'arraybuffer';
    ws.onopen = () => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.({}); } };
    ws.onmessage = event => this.onmessage?.(event);
    ws.onerror = () => {};
    ws.onclose = event => this.finish(event.code, event.reason);
  }
  send(data) {
    if (this.readyState !== 1) return;
    if (this.ws) { this.ws.send(data); return; }
    const channel = this.channel;
    // Blob conversion is async; the chain keeps text and media chunks in order.
    this.chain = this.chain.then(async () => {
      const kind = typeof data === 'string' ? 0 : 1;
      const bytes = typeof data === 'string' ? encoder.encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
      for (const frame of frames(kind, bytes)) if (channel.readyState === 'open') channel.send(frame);
    }).catch(() => {});
  }
  close(code = 1000, reason = '') { this.finish(code, reason); }
  finish(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3; this.cancel?.();
    try { this.ws?.close(); } catch {}
    try { this.channel?.close(); } catch {}
    this.pc?.close();
    this.onclose?.({ code, reason });
  }
}

// Guest side: try a direct DataChannel to the host, then ask for the Cloudflare fallback.
export function connectRoom(key, { onStage = () => {}, parseInvite, directTimeout = 15000, fallbackTimeout = 180000 } = {}) {
  const socket = new RoomSocket(), nonce = randomId();
  let signal, pc, heard = false, cancelled = false, resend, waitTunnel;
  const fail = (reason, code = 4005) => { if (!cancelled) socket.finish(code, reason); };
  socket.cancel = () => { cancelled = true; clearInterval(resend); clearTimeout(waitTunnel); signal?.close(); if (socket.readyState !== 1 || socket.route !== 'direct') pc?.close(); };
  (async () => {
    let answered, tunnelReply;
    const answer = new Promise(resolve => { answered = resolve; }), tunnel = new Promise(resolve => { tunnelReply = resolve; });
    signal = await Signal.create(key, msg => {
      if (msg.to !== nonce || msg.from !== 'host') return;
      heard = true;
      if (msg.type === 'answer' && typeof msg.sdp === 'string') answered(msg.sdp);
      else if (msg.type === 'tunnel-ready' || msg.type === 'tunnel-error') tunnelReply(msg);
    });
    if (cancelled) { signal.close(); return; }
    onStage('direct');
    if (!await signal.ready(10000)) { fail('Não consegui acessar o serviço de conexão. Verifique sua internet e tente novamente.'); return; }
    pc = new RTCPeerConnection({ iceServers: ICE });
    const channel = pc.createDataChannel('concord', { ordered: true });
    const opened = new Promise(resolve => { channel.addEventListener('open', () => resolve(true), { once: true }); });
    await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
    if (cancelled) return;
    const offer = { type: 'offer', from: nonce, to: 'host', sdp: pc.localDescription.sdp };
    void signal.send(offer); resend = setInterval(() => { if (!heard) void signal.send(offer); }, 3000);
    const direct = await Promise.race([
      (async () => { await pc.setRemoteDescription({ type: 'answer', sdp: await answer }); return opened; })().catch(() => false),
      new Promise(resolve => setTimeout(() => resolve(false), directTimeout))
    ]);
    clearInterval(resend);
    if (cancelled) return;
    if (direct) { signal.close(); socket.attachChannel(channel, pc); return; }
    pc.close(); pc = undefined;
    if (!heard) { signal.close(); fail('Sala não encontrada. Confira se quem criou a sala está com o Concord aberto e se o convite é o mais recente.'); return; }
    onStage('tunnel');
    const request = { type: 'tunnel', from: nonce, to: 'host' };
    void signal.send(request); resend = setInterval(() => void signal.send(request), 10000);
    const reply = await Promise.race([tunnel, new Promise(resolve => { waitTunnel = setTimeout(() => resolve(null), fallbackTimeout); })]);
    clearInterval(resend); signal.close();
    if (cancelled) return;
    if (!reply) { fail('A sala não respondeu a tempo. Tente entrar novamente.'); return; }
    if (reply.type === 'tunnel-error') { fail(String(reply.message || 'Não consegui preparar o modo de compatibilidade.').slice(0, 200)); return; }
    let target;
    try { target = parseInvite(String(reply.invite)); } catch { fail('A sala enviou um acesso inválido.'); return; }
    if (target.p2p || target.token !== key) { fail('A sala enviou um acesso inválido.'); return; }
    socket.attachSocket(new WebSocket(target.address.replace(/^http/, 'ws') + '/socket'));
  })().catch(() => fail('Não consegui iniciar a conexão com a sala.'));
  return socket;
}

// Host side: answer offers and bridge each DataChannel to the local room server.
export class P2PHost {
  constructor({ key, address, tunnel, onState = () => {} }) {
    Object.assign(this, { key, address, tunnel, onState });
    this.guests = new Map(); this.tunnelRequests = new Set(); this.stopped = false;
  }
  async start() {
    const signal = await Signal.create(this.key, msg => void this.message(msg).catch(() => {}), { onState: count => this.onState(count > 0) });
    if (this.stopped) signal.close(); else this.signal = signal;
    return this;
  }
  async message(msg) {
    if (this.stopped || msg.to !== 'host' || !guestId.test(msg.from || '')) return;
    if (msg.type === 'offer' && typeof msg.sdp === 'string' && msg.sdp.length < 20000) {
      const existing = this.guests.get(msg.from);
      if (existing) { if (existing.answer) void this.signal.send({ type: 'answer', from: 'host', to: msg.from, sdp: existing.answer }); return; }
      if (this.guests.size >= 16) return;
      const pc = new RTCPeerConnection({ iceServers: ICE }), guest = { pc, answer: '' };
      this.guests.set(msg.from, guest);
      guest.timer = setTimeout(() => { if (!guest.ws) this.drop(msg.from); }, 30000);
      pc.ondatachannel = event => this.bridge(msg.from, guest, event.channel);
      pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) this.drop(msg.from); });
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
      if (this.guests.get(msg.from) !== guest) return;
      guest.answer = pc.localDescription.sdp;
      void this.signal.send({ type: 'answer', from: 'host', to: msg.from, sdp: guest.answer });
    } else if (msg.type === 'tunnel' && !this.tunnelRequests.has(msg.from)) {
      this.tunnelRequests.add(msg.from);
      try { void this.signal?.send({ type: 'tunnel-ready', from: 'host', to: msg.from, invite: await this.tunnel() }); }
      catch (error) { void this.signal?.send({ type: 'tunnel-error', from: 'host', to: msg.from, message: error.message }); }
      finally { this.tunnelRequests.delete(msg.from); }
    }
  }
  bridge(id, guest, channel) {
    if (guest.ws || this.stopped) { channel.close(); return; }
    channel.binaryType = 'arraybuffer';
    const ws = new WebSocket(this.address.replace(/^http/, 'ws') + '/socket?via=p2p'), reader = new Reassembler(), queue = [];
    guest.ws = ws; guest.channel = channel; ws.binaryType = 'arraybuffer';
    const forward = message => { if (message.kind === 2) ws.close(); else ws.send(message.kind ? message.bytes : decoder.decode(message.bytes)); };
    ws.onopen = () => { for (const message of queue.splice(0)) forward(message); };
    channel.onmessage = event => {
      let message;
      try { message = reader.push(new Uint8Array(event.data)); } catch { this.drop(id); return; }
      if (!message) return;
      if (ws.readyState === WebSocket.OPEN) forward(message); else if (queue.length < 64) queue.push(message); else this.drop(id);
    };
    ws.onmessage = event => {
      if (channel.readyState !== 'open') return;
      // Same slow-viewer policy as the server's socket buffer.
      if (channel.bufferedAmount > 32 * 1024 * 1024) { this.drop(id, 4004, 'Sua conexão ficou para trás. Reconecte.'); return; }
      const binary = typeof event.data !== 'string';
      for (const frame of frames(binary ? 1 : 0, binary ? new Uint8Array(event.data) : encoder.encode(event.data))) channel.send(frame);
    };
    ws.onerror = () => {};
    ws.onclose = event => this.drop(id, event.code, event.reason);
    channel.onclose = () => this.drop(id);
  }
  drop(id, code, reason) {
    const guest = this.guests.get(id); if (!guest) return;
    this.guests.delete(id); clearTimeout(guest.timer);
    if (code && guest.channel?.readyState === 'open') for (const frame of closeFrame(code, reason)) guest.channel.send(frame);
    guest.ws?.close();
    // Let the close frame flush before tearing down the transport.
    setTimeout(() => { try { guest.channel?.close(); } catch {} guest.pc.close(); }, code ? 500 : 0);
  }
  stop(reason = 'A sala foi encerrada.') {
    this.stopped = true; this.signal?.close();
    for (const id of [...this.guests.keys()]) this.drop(id, 4003, reason);
  }
}
