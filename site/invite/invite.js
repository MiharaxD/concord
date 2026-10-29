// Static page: never contacts the room. It only turns ?join=<key> into the app's concord:p2p: link.
const $ = id => document.getElementById(id);
function renderInvite() {
  const params = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
  const key = params.get('join') || hash.get('join') || '';
  $('open-concord').hidden = $('open-hint').hidden = $('manual-invite').hidden = true; $('open-concord').removeAttribute('href');
  if (!/^[A-Za-z0-9_-]{22}$/.test(key)) { $('invite-message').textContent = 'Este convite está incompleto ou inválido. Peça um novo link para quem criou a sala.'; return; }
  const code = 'concord:p2p:' + key;
  $('open-concord').href = code; $('manual-code').value = code;
  $('open-concord').hidden = $('open-hint').hidden = $('manual-invite').hidden = false;
}
window.addEventListener('hashchange', renderInvite); renderInvite();
