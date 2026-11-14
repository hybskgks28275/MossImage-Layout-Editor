import { createEditor } from './editor/editor.js';
import { normalize } from './editor/model.js';
import { translate } from './editor/i18n.js';
import { buildPrompt, isSize, readLayout, saveLayout } from './layout.js';

const $ = id => document.getElementById(id);
const strings = {
  ja: { width:'幅', height:'高さ', open:'レイアウトJSONを開く', save:'レイアウトJSONを保存', heading:'プロンプト',
    caption:'画像全体の説明', characters:'キャラクターにする領域番号', characterHelp:'例：1, 3。領域番号は一覧で確認できます。文字領域は常にテキストです。',
    prompt:'生成用JSON', copy:'JSONをコピー', export:'テキスト保存', count:'領域',
    opened:'レイアウトを読み込みました。', legacy:'寸法情報のないレイアウトです。幅と高さを確認してください。',
    saved:'レイアウトを保存しました。', copied:'プロンプトをコピーしました。', exported:'プロンプトを保存しました。',
    layoutFormat:'カスタムノード互換のレイアウトJSON（version 1）が必要です。',
    layoutBounds:'領域がキャンバスの範囲外にあります。レイアウトの寸法を確認してください。',
    fileTooLarge:'ファイルが大きすぎます。レイアウトJSONは2 MBまでです。',
    invalidSize:'幅と高さは64〜16384の16の倍数で指定してください。',
    shrink:'一部の領域が範囲外に出ます。切り詰めてサイズを変更しますか？',
    failed:'処理に失敗しました。' },
  en: { width:'Width', height:'Height', open:'Open layout JSON', save:'Save layout JSON', heading:'Prompt',
    caption:'Overall image description', characters:'Character region numbers', characterHelp:'Example: 1, 3. Use the region numbers in the list. Text regions remain text.',
    prompt:'Generation JSON', copy:'Copy JSON', export:'Save text', count:'regions',
    opened:'Layout loaded.', legacy:'This layout does not include dimensions. Check the width and height.',
    saved:'Layout saved.', copied:'Prompt copied.', exported:'Prompt saved.',
    layoutFormat:'A compatible layout JSON file (version 1) is required.',
    layoutBounds:'A region extends outside the canvas. Check the layout dimensions.',
    fileTooLarge:'File too large. Layout JSON is limited to 2 MB.',
    invalidSize:'Width and height must be multiples of 16 from 64 to 16384.',
    shrink:'Some regions are outside the new canvas. Resize and clip them?',
    failed:'The operation failed.' },
};
const storageKey = 'moss-layout-draft-v1';
const { invoke } = window.__TAURI__.core;
let width = 1024, height = 1024;
let locale = localStorage.getItem('moss-language') ?? 'en';
if (!Object.hasOwn(strings, locale)) locale = 'en';
let loading = false;
const editor = createEditor({ width, height, locale, showFileActions: false, onChange: refresh });
$('editor').append(editor.element);

function options() {
  return { width, height, caption: $('caption').value, characters: $('characters').value };
}
function layout() { return JSON.parse(editor.value); }
function prompt() { return buildPrompt(layout(), options()); }
function refresh() {
  if (loading) return;
  const state = layout(), settings = options();
  $('prompt').value = JSON.stringify(buildPrompt(state, settings), null, 2);
  $('count').textContent = state.boxes.length + ' ' + strings[locale].count;
  try { localStorage.setItem(storageKey, saveLayout(state, settings)); } catch { /* The file export still works. */ }
}
function message(key, error = false, details = '') {
  $('status').classList.toggle('error', error);
  $('status').textContent = (strings[locale][key] ?? strings[locale].failed) + (details ? ' ' + details : '');
}
function setLanguage(value, update = true) {
  locale = value;
  $('language').value = value;
  document.documentElement.lang = value;
  for (const element of document.querySelectorAll('[data-t]')) element.textContent = strings[value][element.dataset.t];
  editor.setLocale(value);
  localStorage.setItem('moss-language', value);
  if (update) refresh();
}
function load(result) {
  loading = true;
  try {
    ({ width, height } = result);
    // Clear the old layout before changing dimensions, then load the imported boxes.
    editor.setValue({ version: 1, boxes: [] });
    editor.setDimensions(width, height);
    editor.setValue(result.layout);
    $('width').value = width;
    $('height').value = height;
    $('caption').value = result.caption;
    $('characters').value = result.characters;
  } finally { loading = false; }
  refresh();
}
async function resize() {
  const w = $('width').valueAsNumber, h = $('height').valueAsNumber;
  if (w === width && h === height) return;
  const reset = () => { $('width').value = width; $('height').value = height; };
  if (!isSize(w) || !isSize(h)) { reset(); message('invalidSize', true); return; }
  if (layout().boxes.some(b => b.x + b.width > w || b.y + b.height > h)) {
    reset();
    if (!await invoke('confirm_resize', { message: strings[locale].shrink })) return;
    $('width').value = w;
    $('height').value = h;
  }
  width = w; height = h;
  editor.setDimensions(w, h);
  $('status').textContent = '';
}
async function run(action) {
  try { await action(); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const key = Object.hasOwn(strings[locale], detail) ? detail : null;
    message(key ?? 'failed', true, key ? '' : translate(locale, detail));
  }
}

$('width').onchange = $('height').onchange = () => run(resize);
$('caption').oninput = $('characters').oninput = refresh;
$('language').onchange = event => { $('status').textContent = ''; setLanguage(event.target.value); };
$('open').onclick = () => run(async () => {
  const raw = await invoke('open_layout');
  if (raw === null) return;
  const result = readLayout(raw, { width, height });
  load(result); message(result.stored ? 'opened' : 'legacy');
});
$('save').onclick = () => run(async () => {
  if (await invoke('save_layout', { text: saveLayout(layout(), options()) })) message('saved');
});
$('copy').onclick = () => run(async () => {
  await invoke('copy_prompt', { text: JSON.stringify(prompt()) }); message('copied');
});
$('export').onclick = () => run(async () => {
  if (await invoke('save_prompt', { text: JSON.stringify(prompt()) + '\n' })) message('exported');
});
setLanguage(locale, false);
const draft = localStorage.getItem(storageKey);
if (draft) {
  try { load(readLayout(draft)); } catch { refresh(); }
} else { refresh(); }
