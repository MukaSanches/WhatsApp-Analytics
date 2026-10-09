const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { isBrowserProfileConflict, repairScript } = require('../session-recovery.cjs');
test('detecta erro de perfil ocupado do Chromium', () => {
  assert.equal(isBrowserProfileConflict('The browser is already running for C:\\Users\\X\\session-analytics'), true);
  assert.equal(isBrowserProfileConflict('Authentication failed'), false);
});
test('script restringe processos ao perfil do app e preserva tokens', () => {
  const dir = path.resolve('C:/Users/Test/whatsapp-session/session-analytics');
  const script = repairScript(dir);
  assert.ok(script.includes('--user-data-dir'));
  assert.ok(script.includes('Get-CimInstance Win32_Process'));
  assert.ok(script.includes('taskkill.exe'));
  assert.ok(!script.includes('Remove-Item'));
  assert.ok(!script.includes('sessionStorage.clear'));
});