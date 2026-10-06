import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createConcord } from '../server.mjs';
const app = await createConcord({ port: 0 }).listen();
try {
  const result = await fetch(app.address + '/api/tunnel', { method: 'POST', headers: { 'x-concord-host': app.hostToken } });
  const info = await result.json();
  if (!result.ok) throw new Error(info.error);
  const url = new URL(info.guestLink); console.log('Túnel criado:', url.origin, 'Verificando HTTPS e WSS…');
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const remote = await fetch(url.origin, { signal: AbortSignal.timeout(10000) });
      console.log('HTTPS:', remote.status, 'tipo:', remote.headers.get('content-type'));
      if (remote.ok) break;
    } catch (error) { console.log('HTTPS:', error.message, error.cause?.code); }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  const ws = new WebSocket(url.origin.replace('https:', 'wss:') + '/socket', { origin: 'http://127.0.0.1:12345', handshakeTimeout: 15000 });
  ws.on('unexpected-response', (req, response) => { console.log('WSS respondeu HTTP', response.statusCode); ws.terminate(); });
  ws.on('error', error => console.log('WSS:', error.message));
  await once(ws, 'open');
  const welcome = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'auth', role: 'viewer', token: app.guestToken }));
  console.log('WSS autenticado:', JSON.parse((await welcome)[0]).type); ws.close();
} finally { await app.close(); }
