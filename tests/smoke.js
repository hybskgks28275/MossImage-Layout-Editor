// Run with npm run test:app. Replace native dialogs and clipboard for this
// process so the test does not interact with the user's files or clipboard.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { app, clipboard, dialog } from 'electron';

const temp = await mkdtemp(join(tmpdir(), 'moss-editor-test-'));
app.setPath('userData', temp);
app.commandLine.appendSwitch('lang', 'ja');
const source = process.env.MOSS_SMOKE_LAYOUT;
const fixture = source ? JSON.parse(await readFile(source, 'utf8')) : {
  version: 1, boxes: [
    { id: 'sign', x: 800, y: 700, width: 480, height: 128, type: 'text', desc: '看板', text: 'MOSS\nモス', palette: ['#33aa77'] },
  ],
};
const inPath = join(temp, 'input.json');
await writeFile(inPath, JSON.stringify(fixture), 'utf8');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [inPath] });
dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: join(temp, options.defaultPath) });
let copied = '';
clipboard.writeText = value => { copied = value; };

const timeout = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 25000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.on('console-message', event => {
    if (event.level === 'error') console.error(event.message);
  });
  window.webContents.once('did-finish-load', async () => {
    const js = script => window.webContents.executeJavaScript(script);
    async function until(callback) {
      for (let i = 0; i < 50; i++) {
        const result = await callback();
        if (result) return result;
        await wait(100);
      }
      throw new Error('Editor response timed out');
    }
    try {
      await until(() => js('!!document.querySelector("#editor > div")?.shadowRoot?.querySelector("svg") && !!document.querySelector("#prompt").value'));
      assert.equal(await js('document.documentElement.lang'), 'en');
      assert.equal(await js('document.querySelector("#language").value'), 'en');
      assert.equal(await js('document.querySelector("#open").textContent'), 'Open layout JSON');
      if (source) await js(`
        document.querySelector('#width').value = 1280;
        document.querySelector('#height').value = 1280;
        document.querySelector('#height').dispatchEvent(new Event('change'));
        void 0;
      `);
      await js(`document.querySelector('#language').value = 'ja'; document.querySelector('#language').dispatchEvent(new Event('change')); document.querySelector('#open').click(); void 0`);
      const json = await until(() => js('document.querySelector("#status").textContent.includes("レイアウト") && document.querySelector("#prompt").value'));
      assert.equal(JSON.parse(json).items.length, fixture.boxes.length);
      assert.equal(JSON.parse(json).items.find(item => item.label === 'text').text, fixture.boxes.find(box => box.type === 'text').text);
      assert.equal(await js('document.querySelector("#width").value'), '1280');
      assert.equal(await js('document.querySelector("#editor > div").shadowRoot.querySelector("input[type=file]") === null'), true);
      assert.equal(await js('innerWidth <= 960 || document.querySelector("#export").getBoundingClientRect().bottom <= innerHeight'), true);

      await js(`
        const caption = document.querySelector('#caption'); caption.value = '動作確認';
        caption.dispatchEvent(new Event('input'));
        document.querySelector('#copy').click(); void 0;
      `);
      await until(() => copied);
      const prompt = JSON.parse(copied);
      assert.equal(prompt.summary.caption, '動作確認');

      await js(`document.querySelector('#save').click(); document.querySelector('#export').click(); void 0`);
      const read = name => readFile(join(temp, name), 'utf8').then(value => JSON.parse(value)).catch(() => null);
      const saved = await until(() => read('moss-layout.json'));
      assert.equal(saved.prompt, '動作確認');
      assert.deepEqual(saved.boxes.map(({ x, y, width, height }) => [x, y, width, height]),
        fixture.boxes.map(({ x, y, width, height }) => [x, y, width, height]));
      assert.deepEqual(await until(() => read('moss-prompt.txt')), prompt);
      assert.equal(await js('localStorage.getItem("moss-language")'), 'ja');
      if (process.env.MOSS_SMOKE_CAPTURE) {
        const screenshot = await window.webContents.capturePage();
        await writeFile(process.env.MOSS_SMOKE_CAPTURE, screenshot.toPNG());
      }
      console.log('Electron app: imported, displayed, copied and saved both outputs.');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    } finally { clearTimeout(timeout); }
  });
});
await import(process.env.MOSS_SMOKE_ASAR ? pathToFileURL(join(process.env.MOSS_SMOKE_ASAR, 'src/main.js')).href : '../src/main.js');
