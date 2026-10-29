// Minimal MQTT 3.1.1 over WebSocket (QoS 0) for public signaling brokers.
// Payloads are already encrypted by p2p.js; brokers only see opaque bytes.
const encoder = new TextEncoder();
function varint(length) {
  const bytes = [];
  do { let byte = length % 128; length = Math.floor(length / 128); if (length) byte |= 128; bytes.push(byte); } while (length);
  return bytes;
}
function text(value) { const bytes = encoder.encode(value); return [bytes.length >> 8, bytes.length & 255, ...bytes]; }
export function packet(type, body) { const data = Uint8Array.from([type, ...varint(body.length)]); const out = new Uint8Array(data.length + body.length); out.set(data); out.set(body, data.length); return out; }
export function connectPacket(clientId, keepAlive = 60) { return packet(0x10, Uint8Array.from([...text('MQTT'), 4, 2, keepAlive >> 8, keepAlive & 255, ...text(clientId)])); }
export function subscribePacket(id, topic) { return packet(0x82, Uint8Array.from([id >> 8, id & 255, ...text(topic), 0])); }
export function publishPacket(topic, payload) {
  const head = Uint8Array.from(text(topic)), body = new Uint8Array(head.length + payload.length);
  body.set(head); body.set(payload, head.length); return packet(0x30, body);
}
// Splits a byte stream into complete packets; returns [packets, remaining bytes].
export function readPackets(buffer) {
  const packets = []; let offset = 0;
  while (offset + 2 <= buffer.length) {
    let length = 0, multiplier = 1, index = offset + 1, byte;
    do {
      if (index >= buffer.length) return [packets, buffer.subarray(offset)];
      byte = buffer[index++]; length += (byte & 127) * multiplier; multiplier *= 128;
      if (multiplier > 128 ** 4) throw new Error('Pacote MQTT inválido.');
    } while (byte & 128);
    if (index + length > buffer.length) break;
    packets.push({ type: buffer[offset] & 0xf0, flags: buffer[offset] & 15, body: buffer.subarray(index, index + length) });
    offset = index + length;
  }
  return [packets, buffer.subarray(offset)];
}
export function readPublish({ flags, body }) {
  const length = (body[0] << 8) | body[1], topic = new TextDecoder().decode(body.subarray(2, 2 + length));
  const start = 2 + length + ((flags >> 1) & 3 ? 2 : 0);
  return { topic, payload: body.slice(start) };
}

export class MqttRelay {
  constructor(url, { onMessage = () => {}, onState = () => {} } = {}) {
    Object.assign(this, { url, onMessage, onState });
    this.topics = new Set(); this.ready = false; this.closed = false; this.retries = 0; this.packetId = 1; this.pending = new Uint8Array();
    this.open();
  }
  open() {
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(this.url, 'mqtt'); } catch { this.retry(); return; }
    this.ws = ws; ws.binaryType = 'arraybuffer'; this.pending = new Uint8Array();
    ws.onopen = () => ws.send(connectPacket('concord-' + Math.random().toString(36).slice(2, 12)));
    ws.onmessage = event => {
      if (this.ws !== ws) return;
      const data = new Uint8Array(event.data), merged = new Uint8Array(this.pending.length + data.length);
      merged.set(this.pending); merged.set(data, this.pending.length);
      let packets;
      try { [packets, this.pending] = readPackets(merged); } catch { ws.close(); return; }
      for (const item of packets) {
        if (item.type === 0x20) {
          if (item.body[1] !== 0) { ws.close(); return; }
          this.ready = true; this.retries = 0; for (const topic of this.topics) this.send(subscribePacket(this.nextId(), topic));
          clearInterval(this.ping); this.ping = setInterval(() => this.send(Uint8Array.of(0xc0, 0)), 30000);
          this.onState(true);
        } else if (item.type === 0x30) { try { const message = readPublish(item); this.onMessage(message.topic, message.payload); } catch {} }
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => { if (this.ws !== ws) return; this.ready = false; clearInterval(this.ping); this.onState(false); this.retry(); };
  }
  retry() { if (this.closed) return; this.retries++; clearTimeout(this.timer); this.timer = setTimeout(() => this.open(), Math.min(1000 * 2 ** Math.min(this.retries, 5), 30000)); }
  nextId() { this.packetId = this.packetId % 65535 + 1; return this.packetId; }
  send(bytes) { if (this.ready && this.ws?.readyState === 1) { this.ws.send(bytes); return true; } return false; }
  subscribe(topic) { this.topics.add(topic); this.send(subscribePacket(this.nextId(), topic)); }
  publish(topic, payload) { return this.send(publishPacket(topic, payload)); }
  close() {
    this.closed = true; this.ready = false; clearTimeout(this.timer); clearInterval(this.ping);
    const ws = this.ws; this.ws = undefined;
    if (ws?.readyState === 1) ws.send(Uint8Array.of(0xe0, 0));
    ws?.close();
  }
}
