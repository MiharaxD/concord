const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { defaults, normalizePreferences, createPreferences } = require('../desktop/preferences.cjs');

test('Preferências aceitam as oito combinações e preservam limites/privacidade', () => {
  for (const resolution of ['720', '1080', '1440', '2160']) for (const fps of ['30', '60']) {
    assert.deepEqual(normalizePreferences({ ...defaults, resolution, fps, bitrateMode: 'manual', bitrateMbps: 60, audioMode: 'system', audioEnabled: false }),
      { resolution, fps, bitrateMode: 'manual', bitrateMbps: 60, audioMode: 'system', audioEnabled: false, audioVersion: 2, micMuted: false, micDevice: '', cameraDevice: '', themeColor: '#aa96ff' });
    assert.equal(normalizePreferences({ ...defaults, audioMode: 'application' }).audioMode, 'application', 'escolha explícita permanece');
  }
  assert.deepEqual(normalizePreferences(null), defaults); assert.equal(defaults.audioMode, 'auto');
  assert.equal(normalizePreferences({ audioMode: 'application' }).audioMode, 'auto', 'padrão antigo migra para automático');
  assert.deepEqual(normalizePreferences({ resolution: '8K', fps: '120', bitrateMbps: 1.25, bitrateMode: 'relay', audioMode: 'microphone', source: 'window:1:0', microphone: true }), defaults);
  for (const invalid of [0, 61, '', 'x', Infinity]) assert.equal(normalizePreferences({ bitrateMbps: invalid }).bitrateMbps, 12);
  assert.equal(normalizePreferences({ bitrateMbps: 1 }).bitrateMbps, 1);
  const voice = normalizePreferences({ micMuted: true, micDevice: 'Mic USB', cameraDevice: 'x'.repeat(300), themeColor: '#4FD08F' });
  assert.deepEqual([voice.micMuted, voice.micDevice, voice.cameraDevice.length, voice.themeColor], [true, 'Mic USB', 200, '#4fd08f']);
  assert.equal(normalizePreferences({ themeColor: 'red' }).themeColor, '#aa96ff');
});
test('Gravações concorrentes são atômicas e última preferência persiste ao reabrir', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'concord-preferences-')), file = path.join(dir, 'preferences.json');
  try {
    const store = await createPreferences(file); assert.equal(store.warning, false);
    await Promise.all([store.save({ ...defaults, resolution: '720' }), store.save({ ...defaults, resolution: '2160', fps: '60', bitrateMbps: 1, audioMode: 'system' })]);
    const reopened = await createPreferences(file);
    assert.equal(reopened.get().resolution, '2160'); assert.equal(reopened.get().fps, '60'); assert.equal(reopened.get().bitrateMbps, 1);
    const copy = reopened.get(); copy.resolution = '720'; assert.equal(reopened.get().resolution, '2160');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), reopened.get());
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Arquivo de preferências inválido usa padrão sem impedir abertura', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'concord-preferences-')), file = path.join(dir, 'preferences.json');
  try { await writeFile(file, '{invalid'); const store = await createPreferences(file); assert.equal(store.warning, true); assert.deepEqual(store.get(), defaults); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
