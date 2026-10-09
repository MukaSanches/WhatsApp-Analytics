// Recuperação restrita ao perfil exclusivo do WhatsApp Analytics no Windows.
'use strict';
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function isBrowserProfileConflict(message) {
  return /browser is already running|userDataDir|profile.*in use|processsingleton/i.test(String(message));
}
function repairScript(sessionDir) {
  if (typeof sessionDir !== 'string' || !path.isAbsolute(sessionDir)) throw new Error('Diretório de sessão inválido.');
  const escaped = sessionDir.replaceAll("'", "''");
  return `
$ErrorActionPreference = 'Stop'
$profilePath = '${escaped}'
$matches = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(msedge|chrome|chromium)\\.exe$' -and
  $_.CommandLine -and
  $_.CommandLine.Contains('--user-data-dir') -and
  $_.CommandLine.Contains($profilePath)
})
foreach ($item in $matches) {
  & taskkill.exe /PID $item.ProcessId /T /F | Out-Null
}
Start-Sleep -Milliseconds 700
$remaining = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(msedge|chrome|chromium)\\.exe$' -and
  $_.CommandLine -and
  $_.CommandLine.Contains('--user-data-dir') -and
  $_.CommandLine.Contains($profilePath)
})
if ($remaining.Count -gt 0) { throw 'O navegador do perfil ainda está em execução.' }
Write-Output $matches.Count
`;
}
async function repairStaleSession(sessionPath) {
  if (process.platform !== 'win32') throw new Error('Reparo automático disponível apenas no Windows.');
  // LocalAuth cria este diretório; não removemos tokens, cookies ou a pasta de sessão.
  const sessionDir = path.join(sessionPath, 'session-analytics');
  const script = repairScript(sessionDir);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',encoded], {
    windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024
  });
  const count = Number(stdout.trim().split(/\s+/).at(-1));
  if (!Number.isSafeInteger(count)) throw new Error('Não foi possível verificar os processos do navegador.');
  return count;
}
module.exports = { isBrowserProfileConflict, repairScript, repairStaleSession };