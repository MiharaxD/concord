const $ = id => document.getElementById(id);
const video = $('screen-video');
const native = window.concord;
let config, role = 'host', socket, target, reconnectTimer, retries = 0, terminal = false;
let stream, display, microphone, audioContext, recorder, peer, peerId, iceQueue = [], fallbackTimer;
let selectedSource, hasViewer = false, mode = '', starting = false, liveSince = 0, mediaSource, sourceBuffer, mediaUrl;
let appendQueue = [], queuedBytes = 0, invite, processing = Promise.resolve(), negotiation = 0;

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = !text; }
function status(text, online = false) {
  $('connection-status').replaceChildren();
  const dot = document.createElement('span'); dot.className = `small-dot${online ? ' green' : ''}`;
  $('connection-status').append(dot, document.createTextNode(text));
}
function send(value) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); }
function friend(connected) {
  hasViewer = connected; $('friend-label').textContent = connected ? 'Seu amigo está na sala' : 'Aguardando seu amigo';
  $('friend-dot').classList.toggle('green', connected);
  $('room-description').textContent = connected ? 'Vocês estão conectados.' : 'Um convite. Dois amigos.';
}
function showVideo(show) { $('stage').classList.toggle('has-video', show); $('empty-stage').hidden = show; }
function setLive(active) {
  $('live-dot').classList.toggle('red', active);
  document.title = active && role === 'host' ? 'Concord · AO VIVO' : 'Concord';
  liveSince = active ? Date.now() : 0;
  $('stage-label').textContent = active ? (role === 'host' ? 'Você está ao vivo' : 'Tela do seu amigo') : (role === 'host' ? 'Sua prévia' : 'Transmissão do amigo');
  if (!active) $('stream-clock').textContent = 'PRONTO QUANDO VOCÊ ESTIVER';
}
function lockSettings(locked) {
  for (const id of ['choose-source', 'quality', 'connection-mode', 'system-audio', 'microphone']) $(id).disabled = locked;
  $('start-button').hidden = Boolean(stream); $('stop-button').hidden = !stream;
  $('start-button').disabled = locked || !selectedSource || socket?.readyState !== WebSocket.OPEN;
}
function transport(value) { mode = value; $('transport-label').textContent = value === 'direct' ? 'Conexão direta · baixa latência' : value === 'relay' ? 'Compatibilidade · por túnel' : value === 'connecting' ? 'Conectando com seu amigo…' : 'Aguardando transmissão'; }

function disconnect() {
  terminal = true; clearTimeout(reconnectTimer); const previous = socket; socket = undefined; previous?.close();
  cleanupPeer(); resetPlayer(); friend(false);
}
function connect(address, token, connectionRole) {
  disconnect(); terminal = false; retries = 0; target = { address, token, role: connectionRole };
  openSocket();
}
function openSocket() {
  if (terminal || !target) return;
  const ws = new WebSocket(target.address.replace(/^http/, 'ws') + '/socket');
  socket = ws; ws.binaryType = 'arraybuffer'; status('Conectando');
  ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', token: target.token, role: target.role })); };
  ws.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== ws) return;
      if (typeof event.data !== 'string') { appendMedia(event.data); return; }
      await message(JSON.parse(event.data));
    }).catch(error => {
      notice(`A conexão encontrou um problema: ${error.message}`, true);
      if (role === 'viewer' && peerId) send({ type: 'fallback', id: peerId, restart: true });
      else if (role === 'host' && stream && hasViewer) startRelay();
    });
  };
  ws.onerror = () => {};
  ws.onclose = event => {
    if (socket !== ws) return;
    socket = undefined; cleanupPeer(); resetPlayer(); friend(false); lockSettings(Boolean(stream)); transport('');
    if (role === 'viewer') setLive(false);
    if (terminal) return;
    if ([4001, 4002, 4003].includes(event.code)) {
      terminal = true; status('Não conectado');
      notice(event.reason || 'Convite inválido ou sala ocupada.', true);
      if (role === 'viewer') $('join-section').hidden = false;
      return;
    }
    retries++; status('Reconectando');
    notice('A conexão caiu. Estou tentando reconectar…');
    reconnectTimer = setTimeout(openSocket, Math.min(1000 * 2 ** Math.min(retries - 1, 4), 15000));
  };
}

async function message(msg) {
  if (msg.type === 'welcome') {
    retries = 0; notice(''); status('Sala conectada', true);
    if (role === 'host') { friend(msg.viewer); lockSettings(Boolean(stream)); publishState(); }
    else { $('join-section').hidden = true; $('viewer-controls').hidden = false; $('empty-title').textContent = 'Você já está na sala.'; $('empty-description').textContent = 'Quando seu amigo compartilhar a tela, ela aparece aqui.'; }
  } else if (msg.type === 'viewer-joined' && role === 'host') {
    friend(true); publishState(); if (stream) await beginPeer();
  } else if (msg.type === 'viewer-left' && role === 'host') {
    friend(false); cleanupPeer(); transport('');
  } else if (msg.type === 'host-left') {
    cleanupPeer(); resetPlayer(); setLive(false); showVideo(false); transport('');
    $('empty-title').textContent = 'Seu amigo desconectou.'; $('empty-description').textContent = 'Se ele voltar com o app aberto, a sala reconecta.';
  } else if (msg.type === 'stream-state' && role === 'viewer') {
    $('stream-quality').textContent = msg.active ? (msg.quality || 'Tela compartilhada') : 'Aguardando seu amigo';
    if (!msg.active) { cleanupPeer(); resetPlayer(); setLive(false); showVideo(false); transport(''); $('empty-title').textContent = 'A sala continua por aqui.'; $('empty-description').textContent = 'Aguardando seu amigo compartilhar a tela.'; }
    else { setLive(true); $('empty-title').textContent = 'Conectando à transmissão…'; $('empty-description').textContent = 'Preparando imagem e áudio.'; }
  } else if (msg.type === 'offer' && role === 'viewer') {
    cleanupPeer(); resetPlayer(); peerId = msg.id; iceQueue = [];
    const pc = makePeer(msg.id); peer = pc; transport('connecting');
    pc.ontrack = event => {
      if (peer !== pc) return;
      video.srcObject = event.streams[0]; showVideo(true); video.muted = false;
      video.play().catch(() => { video.muted = true; notice('Clique em Ativar som para ouvir a transmissão.'); });
      updateSound();
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
    await drainIce(pc);
    await pc.setLocalDescription(await pc.createAnswer());
    if (peer === pc) { send({ type: 'answer', id: msg.id, sdp: pc.localDescription.sdp }); flushLocalIce(pc, msg.id); }
    fallbackTimer = setTimeout(() => { if (peer === pc && pc.connectionState !== 'connected') send({ type: 'fallback', id: msg.id }); }, 10000);
  } else if (msg.type === 'answer' && role === 'host' && msg.id === peerId && peer) {
    await peer.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); await drainIce(peer);
  } else if (msg.type === 'ice' && msg.id === peerId && peer) {
    if (peer.remoteDescription) await peer.addIceCandidate(msg.candidate); else iceQueue.push(msg.candidate);
  } else if (msg.type === 'fallback' && role === 'host' && msg.id === peerId && stream && hasViewer) {
    startRelay(Boolean(msg.restart));
  } else if (msg.type === 'relay-start' && role === 'viewer') {
    cleanupPeer(); peerId = msg.id; resetPlayer(); transport('relay'); setupPlayer(msg.mime);
  } else if (msg.type === 'relay-stop' && role === 'viewer') {
    resetPlayer(); showVideo(false);
  } else if (msg.type === 'mode') {
    transport(msg.mode);
  } else if (msg.type === 'tunnel-closed') {
    invite = undefined; $('invite-result').hidden = true; $('invite-button').hidden = false;
    notice('O acesso pela internet encerrou. Crie outro convite para reconectar seu amigo.', true);
  }
}
async function drainIce(pc) { for (const candidate of iceQueue.splice(0)) await pc.addIceCandidate(candidate); }
function makePeer(id) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] });
  pc.localIce = []; pc.signalReady = false;
  pc.onicecandidate = event => {
    if (!event.candidate || peer !== pc) return;
    if (pc.signalReady) send({ type: 'ice', id, candidate: event.candidate.toJSON() });
    else pc.localIce.push(event.candidate.toJSON());
  };
  pc.onconnectionstatechange = () => {
    if (peer !== pc) return;
    if (pc.connectionState === 'connected') { clearTimeout(fallbackTimer); transport('direct'); notice(''); }
    if (pc.connectionState === 'failed') {
      if (role === 'host') startRelay(); else send({ type: 'fallback', id });
    }
    if (pc.connectionState === 'disconnected') {
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => { if (peer === pc && pc.connectionState !== 'connected') { if (role === 'host') startRelay(); else send({ type: 'fallback', id }); } }, 3000);
    }
  };
  return pc;
}
function flushLocalIce(pc, id) { pc.signalReady = true; for (const candidate of pc.localIce.splice(0)) send({ type: 'ice', id, candidate }); }
function stopRecorder() { const old = recorder; recorder = undefined; if (old) { old.ondataavailable = null; old.onerror = null; if (old.state !== 'inactive') old.stop(); } }
function cleanupPeer() {
  negotiation++; clearTimeout(fallbackTimer); stopRecorder();
  const pc = peer; peer = undefined; peerId = undefined; iceQueue = []; pc?.close();
}
async function beginPeer() {
  cleanupPeer(); if (!stream || !hasViewer) return;
  const generation = negotiation; peerId = crypto.randomUUID();
  if ($('connection-mode').value === 'relay') { startRelay(); return; }
  const id = peerId, pc = makePeer(id); peer = pc; transport('connecting');
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
  try {
    for (const sender of pc.getSenders()) {
      if (sender.track.kind === 'video') {
        const params = sender.getParameters(); params.encodings ||= [{}]; params.encodings[0].maxBitrate = bitrate();
        await sender.setParameters(params);
      }
    }
    await pc.setLocalDescription(await pc.createOffer());
    if (generation !== negotiation || peer !== pc) return;
    send({ type: 'offer', id, sdp: pc.localDescription.sdp });
    flushLocalIce(pc, id);
    fallbackTimer = setTimeout(() => { if (peer === pc && pc.connectionState !== 'connected') startRelay(); }, 9000);
  } catch (error) { if (peer === pc) startRelay(); }
}
function bitrate() { return $('quality').value === '1080:60' ? 7_000_000 : $('quality').value === '1080:30' ? 4_500_000 : 2_500_000; }
function startRelay(restart = false) {
  if (!stream || !hasViewer || socket?.readyState !== WebSocket.OPEN || (recorder && !restart)) return;
  const id = peerId || crypto.randomUUID(); cleanupPeer(); peerId = id;
  const mime = stream.getAudioTracks().length ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mime)) { notice('Este PC não tem o codificador necessário para o modo de compatibilidade.', true); return; }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate(), audioBitsPerSecond: 128000 });
  recorder = rec; transport('relay');
  send({ type: 'relay-start', id, mime });
  rec.ondataavailable = event => {
    if (!event.data.size || recorder !== rec || socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 12 * 1024 * 1024) { stopSharing(); notice('Sua internet não está acompanhando a transmissão. Tente 720p · 30 FPS.', true); return; }
    socket.send(event.data);
  };
  rec.onerror = () => { stopSharing(); notice('O codificador falhou. Tente compartilhar novamente.', true); };
  rec.start(250);
}

function resetPlayer() {
  appendQueue = []; queuedBytes = 0; sourceBuffer = undefined; mediaSource = undefined;
  if (role === 'viewer') { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load(); showVideo(false); }
  if (mediaUrl) URL.revokeObjectURL(mediaUrl); mediaUrl = undefined;
}
function setupPlayer(mime) {
  if (!MediaSource.isTypeSupported(mime)) throw new Error('O formato da transmissão não é suportado neste PC.');
  const ms = new MediaSource(); mediaSource = ms; mediaUrl = URL.createObjectURL(ms);
  video.srcObject = null; video.src = mediaUrl; video.muted = false; updateSound();
  ms.addEventListener('sourceopen', () => {
    if (mediaSource !== ms) return;
    try {
      sourceBuffer = ms.addSourceBuffer(mime);
      sourceBuffer.addEventListener('updateend', pumpMedia);
      sourceBuffer.addEventListener('error', () => {
        resetPlayer(); send({ type: 'fallback', id: peerId, restart: true }); notice('Recuperando a imagem da transmissão…');
      });
      pumpMedia(); video.play().catch(() => { video.muted = true; updateSound(); });
    } catch (error) { notice(`Não consegui reproduzir a transmissão: ${error.message}`, true); }
  }, { once: true });
}
function appendMedia(chunk) {
  if (role !== 'viewer' || !mediaSource) return;
  appendQueue.push(chunk); queuedBytes += chunk.byteLength;
  if (queuedBytes > 24 * 1024 * 1024) { resetPlayer(); send({ type: 'fallback', id: peerId, restart: true }); return; }
  pumpMedia();
}
function pumpMedia() {
  const sb = sourceBuffer;
  if (!sb || sb.updating || mediaSource?.readyState !== 'open') return;
  try {
    if (sb.buffered.length) {
      const end = sb.buffered.end(sb.buffered.length - 1);
      if (video.currentTime === 0 || end - video.currentTime > 2) video.currentTime = Math.max(sb.buffered.start(0), end - .5);
      if (video.currentTime > 35 && sb.buffered.start(0) < video.currentTime - 35) { sb.remove(0, video.currentTime - 30); return; }
    }
    if (appendQueue.length) { const chunk = appendQueue.shift(); queuedBytes -= chunk.byteLength; sb.appendBuffer(chunk); }
  } catch { resetPlayer(); send({ type: 'fallback', id: peerId, restart: true }); }
}
video.addEventListener('playing', () => { if (role === 'viewer') { showVideo(true); notice(''); } });
video.addEventListener('error', () => {
  if (role === 'viewer' && mediaSource) { resetPlayer(); send({ type: 'fallback', id: peerId, restart: true }); }
});
function updateSound() { $('sound-button').textContent = video.muted ? 'Ativar som' : 'Silenciar'; }
video.volume = .8;

function publishState() { send({ type: 'stream-state', active: Boolean(stream), label: selectedSource?.name || '', quality: $('quality').selectedOptions[0].textContent }); }
async function chooseSource() {
  if (!native || stream) return;
  $('choose-source').disabled = true; notice('');
  try {
    const sources = await native.sources(); $('source-list').replaceChildren();
    if (!sources.length) throw new Error('Nenhuma tela ou janela disponível.');
    for (const source of sources) {
      const button = document.createElement('button'); button.className = 'source-choice';
      const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
      const label = document.createElement('span'); label.textContent = source.name;
      button.append(image, label);
      button.onclick = () => { selectedSource = source; $('source-name').textContent = source.name; $('source-description').textContent = source.id.startsWith('screen:') ? 'Tudo nesse monitor será mostrado.' : 'Somente essa janela será mostrada.'; $('source-picker').close(); lockSettings(false); };
      $('source-list').append(button);
    }
    $('source-picker').showModal();
  } catch (error) { notice(`Não consegui listar as telas: ${error.message}`, true); }
  finally { $('choose-source').disabled = false; }
}
async function startSharing() {
  if (starting || stream || !selectedSource) return;
  starting = true; lockSettings(true); notice('');
  try {
    await native.selectSource(selectedSource.id);
    const [height, fps] = $('quality').value.split(':').map(Number);
    display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: $('system-audio').checked });
    const track = display.getVideoTracks()[0];
    await track.applyConstraints({ width: { max: Math.round(height * 16 / 9) }, height: { max: height }, frameRate: { max: fps } });
    track.contentHint = fps === 60 ? 'motion' : 'detail';
    const audio = display.getAudioTracks();
    if ($('microphone').checked) {
      try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        audio.push(...microphone.getAudioTracks());
      } catch { notice('O microfone não ficou disponível. Sua tela será compartilhada com o áudio do computador.'); }
    }
    stream = new MediaStream([track]);
    if (audio.length > 1) {
      audioContext = new AudioContext(); await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      for (const audioTrack of audio) audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(destination);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (audio.length) stream.addTrack(audio[0]);
    track.onended = () => stopSharing();
    video.srcObject = display; video.muted = true; video.play().catch(() => {});
    showVideo(true); setLive(true); $('stream-quality').textContent = $('quality').selectedOptions[0].textContent;
    publishState(); if (hasViewer) await beginPeer();
    else transport('');
  } catch (error) {
    stopSharing(); notice(error.name === 'NotAllowedError' ? 'A captura não foi autorizada. Escolha a tela e tente novamente.' : `Não consegui iniciar a captura: ${error.message}`, true);
  } finally { starting = false; lockSettings(Boolean(stream)); }
}
function stopSharing() {
  cleanupPeer();
  for (const item of [stream, display, microphone]) for (const track of item?.getTracks() || []) { track.onended = null; track.stop(); }
  audioContext?.close().catch(() => {}); stream = display = microphone = audioContext = undefined;
  video.srcObject = null; showVideo(false); setLive(false); transport('');
  publishState(); lockSettings(false); $('stream-quality').textContent = selectedSource ? 'Tela selecionada · pronta para compartilhar' : 'Nenhuma tela selecionada';
}
async function switchRole(next) {
  if (role === next && socket) return;
  if (stream) stopSharing(); disconnect(); role = next; notice('');
  document.body.classList.toggle('viewer-mode', role === 'viewer');
  $('host-tab').classList.toggle('selected', role === 'host'); $('viewer-tab').classList.toggle('selected', role === 'viewer');
  $('host-controls').hidden = role !== 'host'; $('join-section').hidden = role !== 'viewer'; $('viewer-controls').hidden = true;
  $('page-title').textContent = role === 'host' ? 'Bora compartilhar?' : 'O melhor lugar é junto.';
  $('page-eyebrow').textContent = role === 'host' ? 'SUA TELA, SUA GALERA' : 'NA SALA DO SEU AMIGO';
  $('empty-title').textContent = role === 'host' ? 'Um espaço pra estar junto.' : 'Seu lugar tá guardado.';
  $('empty-description').textContent = role === 'host' ? 'Escolha o que mostrar e chama seu amigo.' : 'Cole o convite para assistir à tela dele.';
  setLive(false); transport(''); status(role === 'host' ? 'Preparando' : 'Esperando convite');
  if (role === 'host') { video.muted = true; connect(config.address, config.hostToken, 'host'); }
}
function parseInvite(text) {
  let url; try { url = new URL(text.trim()); } catch { throw new Error('Cole o convite completo que seu amigo enviou.'); }
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('O convite precisa começar com https://.');
  const token = new URLSearchParams(url.hash.slice(1)).get('join');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '') || url.username || url.password) throw new Error('O convite está incompleto ou inválido.');
  return { address: url.origin, token };
}
function showInvite(data) {
  invite = data; $('invite-link').value = data.guestLink; $('invite-result').hidden = false; $('invite-button').hidden = true;
}
async function makeInvite() {
  $('invite-button').disabled = true; $('invite-button').textContent = 'Preparando convite…'; notice('Estou criando e verificando seu acesso pela internet. Na primeira vez, isso pode levar até dois minutos.');
  try { showInvite(await native.tunnel()); notice('Convite pronto. Copie e mande para seu amigo abrir no Concord.'); }
  catch (error) { notice(`Não consegui criar o convite: ${error.message}`, true); }
  finally { $('invite-button').disabled = false; $('invite-button').textContent = 'Criar convite pela internet ↗'; }
}

$('host-tab').onclick = () => switchRole('host');
$('viewer-tab').onclick = () => switchRole('viewer');
$('choose-source').onclick = chooseSource;
$('close-picker').onclick = () => $('source-picker').close();
$('start-button').onclick = startSharing;
$('stop-button').onclick = () => { stopSharing(); notice('Transmissão encerrada. Seu convite continua válido até você fechar o acesso.'); };
$('invite-button').onclick = makeInvite;
$('copy-button').onclick = async () => {
  try { await native.copyInvite(); notice('Convite copiado. Agora é só mandar pro seu amigo.'); }
  catch { $('invite-link').select(); notice('Selecionei o convite. Use Ctrl+C para copiar.'); }
};
$('renew-button').onclick = async () => { try { showInvite(await native.renewInvite()); notice('Convite trocado. O anterior não funciona mais.'); } catch (error) { notice(error.message, true); } };
$('close-invite').onclick = async () => {
  try { await native.renewInvite(); await native.closeTunnel(); invite = undefined; $('invite-result').hidden = true; $('invite-button').hidden = false; notice('Acesso fechado. Crie outro convite quando quiser chamar alguém.'); }
  catch (error) { notice(error.message, true); }
};
$('join-form').onsubmit = event => {
  event.preventDefault();
  try { const data = parseInvite($('join-input').value); notice(''); connect(data.address, data.token, 'viewer'); }
  catch (error) { notice(error.message, true); }
};
$('leave-button').onclick = () => { disconnect(); setLive(false); showVideo(false); $('join-section').hidden = false; $('viewer-controls').hidden = true; status('Saiu da sala'); transport(''); notice('Você saiu da sala.'); };
$('sound-button').onclick = () => { video.muted = !video.muted; video.play().catch(() => {}); updateSound(); };
$('volume').oninput = () => { video.volume = Number($('volume').value); video.muted = video.volume === 0; updateSound(); };
$('fullscreen-button').onclick = () => {
  const action = document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
  action.catch(error => notice(`Não consegui abrir a tela cheia: ${error.message}`, true));
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
setInterval(() => {
  if (!liveSince) return;
  const elapsed = Math.floor((Date.now() - liveSince) / 1000);
  $('stream-clock').textContent = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
}, 1000);
window.addEventListener('beforeunload', () => { terminal = true; clearTimeout(reconnectTimer); socket?.close(); for (const track of display?.getTracks() || []) track.stop(); });

try {
  if (!native) throw new Error('Abra o executável do Concord. Esta interface foi feita para o app desktop.');
  config = await native.bootstrap(); $('app-version').textContent = `Concord ${config.version} · pessoal`;
  connect(config.address, config.hostToken, 'host');
  const session = await native.session(); if (session.public) showInvite(session);
} catch (error) { notice(error.message, true); status('Abra o aplicativo'); }
