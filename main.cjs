const { app, BrowserWindow, ipcMain, dialog, net, protocol } = require('electron');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { WhatsAppBridge } = require('./whatsapp-bridge.cjs');

// Não permitir dois processos Electron disputando o mesmo perfil Chromium.
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

protocol.registerSchemesAsPrivileged([{ scheme: 'wa-local', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

function decodeBuffer(buffer) {
  // WhatsApp exports are UTF-8; BOM removal and replacement-char detection are intentional.
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

async function loadExport(filePath) {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_IMPORT_BYTES) throw new Error('Arquivo maior que o limite de 25 MB.');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') return { name: path.basename(filePath), text: decodeBuffer(await fs.readFile(filePath)) };
  if (ext === '.zip') {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.txt'));
    if (!entries.length) throw new Error('Este ZIP não contém um arquivo TXT de conversa.');
    entries.sort((a, b) => (b.header.size || 0) - (a.header.size || 0));
    const selected = entries[0];
    if (selected.header.size > MAX_UNCOMPRESSED_BYTES) throw new Error('TXT compactado excede o limite de 40 MB.');
    return { name: path.basename(filePath) + ' / ' + path.basename(selected.entryName), text: decodeBuffer(selected.getData()) };
  }
  throw new Error('Formato não aceito. Escolha um TXT ou ZIP do WhatsApp.');
}

let windowRef;
let bridge;
function emitToWindow(channel, payload) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send(channel, payload);
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 720,
    backgroundColor: '#071b16', title: 'WhatsApp Analytics',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, devTools: !app.isPackaged
    }
  });
  windowRef = win;
  win.on('closed', () => { if (windowRef === win) windowRef = null; });
  win.loadURL('wa-local://desktop/src/index.html');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}
if (singleInstance) app.whenReady().then(() => {
  bridge = new WhatsAppBridge({ sessionPath: path.join(app.getPath('userData'), 'whatsapp-session'), emit: emitToWindow });
  ipcMain.handle('wa-status', () => bridge.getStatus());
  ipcMain.handle('wa-connect', () => bridge.start());
  ipcMain.handle('wa-chats', () => bridge.listChats());
  ipcMain.handle('wa-sync', (_event, ids, options) => bridge.sync(ids, options));
  ipcMain.handle('wa-cancel-sync', () => bridge.cancelSync());
  ipcMain.handle('wa-repair', () => bridge.repair());
  ipcMain.handle('wa-stop', (_event, logout) => bridge.stop(logout === true));
  protocol.handle('wa-local', (request) => {
    const parsed = new URL(request.url);
    if (parsed.hostname !== 'desktop') return new Response('Forbidden', { status: 403 });
    let requested;
    try { requested = path.resolve(__dirname, '.' + decodeURIComponent(parsed.pathname)); }
    catch { return new Response('Invalid path', { status: 400 }); }
    const relative = path.relative(__dirname, requested);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(requested).toString());
  });
  ipcMain.handle('import-chat', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar exportação do WhatsApp',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Conversas exportadas', extensions: ['txt', 'zip'] }]
    });
    if (result.canceled) return [];
    if (result.filePaths.length > 20) throw new Error('Importe no máximo 20 conversas por vez.');
    const out = [];
    for (const filePath of result.filePaths) out.push(await loadExport(filePath));
    return out;
  });
  ipcMain.handle('save-report', async (_e, { defaultName, content, type }) => {
    if (!['csv', 'json'].includes(type) || typeof content !== 'string' || content.length > 20 * 1024 * 1024) {
      throw new Error('Relatório inválido.');
    }
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salvar relatório', defaultPath: defaultName,
      filters: [{ name: type.toUpperCase(), extensions: [type] }]
    });
    if (canceled || !filePath) return false;
    await fs.writeFile(filePath, content, 'utf8');
    return true;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

let shutdownComplete = false;
app.on('before-quit', event => {
  if (shutdownComplete || !bridge?.client) return;
  event.preventDefault();
  bridge.shutdown().catch(() => {}).finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});