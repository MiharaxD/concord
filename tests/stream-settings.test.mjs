import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityPreset, videoBitrate } from '../public/stream-settings.js';
test('Presets aumentam qualidade sem inventar resolução/fps e dão referência automática', () => {
  assert.deepEqual(qualityPreset('1440:60'), { width: 2560, height: 1440, fps: 60, bitrate: 24_000_000 });
  assert.equal(qualityPreset('2160:30').width, 3840);
  assert.equal(videoBitrate('1080:30'), 8_000_000);
  assert.equal(videoBitrate('2160:60'), 45_000_000);
});
test('Mbps personalizado é convertido para bits/s sem depender do preset', () => {
  assert.equal(videoBitrate('720:30', '11.5'), 11_500_000);
  assert.equal(videoBitrate('2160:60', 1), 1_000_000);
  assert.equal(videoBitrate('2160:60', 60), 60_000_000);
  for (const value of ['', 'texto', 0, -1, 60.5, 1.25, Infinity, NaN]) assert.throws(() => videoBitrate('1080:30', value), RangeError);
});
