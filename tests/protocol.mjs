import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile), root = process.cwd(), id = Date.now();
const run = path.join(root, 'test-results', 'protocol-' + id); await mkdir(run, { recursive: true });
const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis-3.0.4.1');
const compiler = process.env.NSIS_COMPILER || path.join(cache, (await readdir(cache)).find(name => name.startsWith('nsis-3.0.4.1-')), 'makensis.exe');
const registry = `Software\\ConcordProtocolQA\\${id}`, executable = 'C:\\Pasta com espaços\\Concord.exe';
const harness = path.join(run, 'protocol.nsi'), binary = path.join(run, 'protocol-test.exe');
// Runs the exact installation/uninstallation macros against a private test key.
// Never changes Software\Classes\concord or the user's installed program.
await writeFile(harness, String.raw`Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${binary}"
!include LogicLib.nsh
!include "${path.join(root, 'build', 'protocol.nsh')}"
Section
  !insertmacro ConcordRegisterProtocol "${registry}" "${executable}"
  ClearErrors
  ReadRegStr $1 HKCU "${registry}" "URL Protocol"
  ${'${If}'} ${'${Errors}'}
    SetErrorLevel 1
    Goto cleanup
  ${'${EndIf}'}
  ReadRegStr $1 HKCU "${registry}\shell\open\command" ""
  ${'${If}'} $1 != '"${executable}" "%1"'
    SetErrorLevel 2
    Goto cleanup
  ${'${EndIf}'}
  !insertmacro ConcordUnregisterProtocol "${registry}" "C:\Outro app.exe"
  ClearErrors
  ReadRegStr $1 HKCU "${registry}\shell\open\command" ""
  ${'${If}'} ${'${Errors}'}
    SetErrorLevel 3
    Goto cleanup
  ${'${EndIf}'}
  !insertmacro ConcordUnregisterProtocol "${registry}" "${executable}"
  ClearErrors
  ReadRegStr $1 HKCU "${registry}\shell\open\command" ""
  ${'${IfNot}'} ${'${Errors}'}
    SetErrorLevel 4
    Goto cleanup
  ${'${EndIf}'}
  SetErrorLevel 0
  cleanup:
  DeleteRegKey HKCU "${registry}"
SectionEnd
`);
await exec(compiler, ['/V2', harness], { windowsHide: true, timeout: 30000 });
const result = await exec(binary, [], { windowsHide: true, timeout: 30000 });
assert.equal(result.stderr, ''); console.log('PROTOCOL_REGISTRY_PASS: registro por usuário, caminho/argumento entre aspas e remoção somente do handler próprio; chave de QA isolada.');
