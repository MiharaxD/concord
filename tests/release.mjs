// Validate the publisher against an in-memory GitHub API, with no external writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const names = [`Concord-${pkg.version}-Setup.exe`, `Concord-${pkg.version}-Setup.exe.blockmap`, `Concord-${pkg.version}-Setup.exe.sha256`, 'latest.yml'];
const uploads = [], originalFetch = globalThis.fetch, token = process.env.GH_TOKEN;
let scenario = 'success', publications = 0, creates = 0, deletes = [];
const originalLog = console.log;
console.log = (...args) => originalLog('[API simulada]', ...args);
const originalSha = process.env.GITHUB_SHA;
process.env.GITHUB_SHA = '0000000000000000000000000000000000000000';
process.env.GH_TOKEN = 'concord-publisher-local-test';
globalThis.fetch = async (url, options = {}) => {
  assert.ok(String(url).startsWith('https://api.github.com/repos/MiharaxD/concord/') || String(url).startsWith('https://uploads.github.com/repos/MiharaxD/concord/'));
  assert.equal(options.headers.Authorization, 'Bearer concord-publisher-local-test');
  if (String(url).includes('/releases/tags/')) return scenario === 'published' ? Response.json({ draft: false }) : new Response('', { status: 404 });
  if (String(url).includes('/releases?')) return Response.json(scenario === 'resume' ? [{ id: 2, draft: true, tag_name: `v${pkg.version}`,
    upload_url: 'https://uploads.github.com/repos/MiharaxD/concord/releases/2/assets{?name,label}', assets: [{ id: 77, name: names[0] }] }] : []);
  if (options.method === 'DELETE') { deletes.push(url); return new Response(null, { status: 204 }); }
  if (options.method === 'POST' && String(url).endsWith('/releases')) {
    const body = JSON.parse(options.body); assert.equal(body.draft, true); assert.equal(body.tag_name, `v${pkg.version}`);
    creates++;
    return Response.json({ id: 1, assets: [], upload_url: 'https://uploads.github.com/repos/MiharaxD/concord/releases/1/assets{?name,label}' });
  }
  if (String(url).includes('uploads.github.com')) {
    const name = new URL(url).searchParams.get('name'); assert.equal(name, names[uploads.length]);
    if (scenario === 'failure' && name.endsWith('.blockmap')) { options.body.destroy(); return new Response('', { status: 403 }); }
    let length = 0; for await (const chunk of options.body) length += chunk.length;
    assert.equal(length, Number(options.headers['Content-Length'])); assert.ok(length > 0);
    uploads.push(name); return Response.json({ id: uploads.length });
  }
  if (options.method === 'PATCH') {
    assert.deepEqual(uploads, names); assert.equal(JSON.parse(options.body).draft, false); return Response.json({});
  }
  throw new Error('Requisicao inesperada no publisher');
};
try {
  await import('../scripts/publish-release.mjs'); assert.equal(creates, 1);
  uploads.length = 0; scenario = 'resume'; await import('../scripts/publish-release.mjs?resume'); assert.equal(creates, 1); assert.equal(deletes.length, 1);
  uploads.length = 0; scenario = 'failure'; await assert.rejects(import('../scripts/publish-release.mjs?failure'), /HTTP 403/); assert.deepEqual(uploads, [names[0]]);
  scenario = 'published'; await assert.rejects(import('../scripts/publish-release.mjs?published'), /ja esta publicada/);
  console.log('PUBLISH_LOCAL_TEST: checksum, quatro uploads, retomada de rascunho, falha e release publicada protegida confirmados');
}
finally {
  globalThis.fetch = originalFetch; if (token === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = token;
  if (originalSha === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = originalSha;
  console.log = originalLog;
}
