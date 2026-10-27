import test from 'node:test';
import assert from 'node:assert/strict';
import { visualProfile } from '../public/profile.js';
test('Perfil compartilha apenas aparência validada, sem credenciais ou metadados de conta', () => {
  assert.deepEqual(visualProfile({ name: ' Yuri\u0000 ', photo: 'data:image/jpeg;base64,YWJj', banner: 'data:image/jpeg;base64,YWJj', accentColor: '#AABBCC', accessToken: 'secret', discordId: '123' }),
    { name: 'Yuri', photo: 'data:image/jpeg;base64,YWJj', banner: 'data:image/jpeg;base64,YWJj', accentColor: '#aabbcc' });
  assert.deepEqual(visualProfile(null), { name: '', photo: '' });
  assert.deepEqual(visualProfile({ banner: 'https://evil.test', accentColor: { toString: null } }), { name: '', photo: '', banner: '', accentColor: '' });
});
