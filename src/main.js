import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol } from 'electron';
import { open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_LAYOUT_BYTES } from './layout.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const page = 'moss://editor/index.html';
const assets = new Set(['index.html', 'style.css', 'renderer.js', 'layout.js',
  'editor/editor.js', 'editor/model.js', 'editor/i18n.js']);
const promptLimit = MAX_LAYOUT_BYTES * 2;

protocol.registerSchemesAsPrivileged([{ scheme: 'moss', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function register(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.senderFrame?.url !== page || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Invalid sender');
    }
    return callback(BrowserWindow.fromWebContents(event.sender), ...args);
  });
}
function checkText(text, limit) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > limit) throw new Error('fileTooLarge');
}
async function save(window, text, extension, filename, limit) {
  checkText(text, limit);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: filename, filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (canceled || !filePath) return false;
  await writeFile(filePath, text, 'utf8');
  return true;
}

app.whenReady().then(async () => {
  protocol.handle('moss', async request => {
    const url = new URL(request.url);
    const asset = url.pathname.slice(1);
    if (url.hostname !== 'editor' || !assets.has(asset)) return new Response(null, { status: 404 });
    const mime = asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css' : 'text/javascript';
    return new Response(await readFile(join(root, asset)), { headers: { 'Content-Type': mime + '; charset=utf-8' } });
  });
  register('layout:open', async window => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openFile'], filters: [{ name: 'Layout JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    const file = await open(filePaths[0], 'r');
    try {
      if ((await file.stat()).size > MAX_LAYOUT_BYTES) throw new Error('fileTooLarge');
      const bytes = Buffer.alloc(MAX_LAYOUT_BYTES + 1);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await file.read(bytes, total, bytes.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > MAX_LAYOUT_BYTES) throw new Error('fileTooLarge');
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total));
    } finally { await file.close(); }
  });
  register('layout:save', (window, text) => save(window, text, 'json', 'moss-layout.json', MAX_LAYOUT_BYTES));
  register('prompt:save', (window, text) => save(window, text, 'txt', 'moss-prompt.txt', promptLimit));
  register('prompt:copy', (_window, text) => { checkText(text, promptLimit); clipboard.writeText(text); });

  const window = new BrowserWindow({
    width: 1470, height: 960, minWidth: 900, minHeight: 640,
    backgroundColor: '#0c1421',
    webPreferences: { preload: join(root, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await window.loadURL(page);
}).catch(error => { console.error(error); app.quit(); });

app.on('window-all-closed', () => app.quit());
