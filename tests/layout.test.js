import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../src/editor/model.js';
import { buildPrompt, readLayout, saveLayout } from '../src/layout.js';

const version1 = {
  version: 1,
  grid: { cols: 32, rows: 24, snap: false, background: '#2b2b2b', alternate: '#353535' },
  boxes: [
    { id: 'obj', x: 0, y: 0, width: 64, height: 32, type: 'obj', desc: '窓', palette: [], display_color: '#ffffff' },
    { id: 'char', x: 64, y: 128, width: 192, height: 384, type: 'obj', desc: 'キャラクター', palette: ['#33aacc'] },
    { id: 'text', x: 512, y: 512, width: 512, height: 256, type: 'text', desc: '看板', text: '文字\n第二行', palette: [] },
  ],
};

test('node layout and desktop layout keep the same boxes and grid in both editors', () => {
  const imported = readLayout('\uFEFF' + JSON.stringify(version1));
  assert.equal(imported.stored, false);
  const options = { width: 1024, height: 1024, caption: ' 夜の街 ', characters: '2, 3' };
  const serialized = saveLayout(imported.layout, options);
  const nodeState = normalize(serialized, options.width, options.height);
  assert.deepEqual(nodeState.boxes, imported.layout.boxes);
  assert.deepEqual(nodeState.grid, version1.grid);
  const restored = readLayout(JSON.stringify(nodeState));
  for (const [key, value] of Object.entries(options)) assert.equal(restored[key], value);
  assert.equal(restored.stored, true);
});

test('generation matches MOSS coordinate conversion, ordering and optional fields', () => {
  const { layout } = readLayout(JSON.stringify(version1));
  assert.deepEqual(buildPrompt(layout, { width: 1024, height: 1024, caption: ' 夜の街 ', characters: '２, 3' }), {
    summary: { caption: '夜の街' },
    items: [
      { label: 'object', caption: '窓', bbox: [-512, -512, -480, -448] },
      { label: 'character', caption: 'キャラクター', palette: ['#33aacc'], bbox: [-384, -449, 0, -256] },
      { label: 'text', caption: '看板', text: '文字\n第二行', bbox: [0, 0, 256, 512] },
    ],
    bbox_coord_space: 'abs_centralized',
    bbox_format: 'yxyx',
  });
});

test('legacy dimensions expand to fit while incompatible JSON is rejected', () => {
  const large = { version: 1, boxes: [{ ...version1.boxes[0], x: 1100, y: 800, width: 60, height: 230 }] };
  const result = readLayout(JSON.stringify(large), { width: 1024, height: 768 });
  assert.deepEqual([result.width, result.height], [1168, 1040]);
  assert.equal(result.layout.boxes[0].width, 60);
  assert.throws(() => readLayout(JSON.stringify({ ...large, width: 1024, height: 1024 })), /layoutBounds/);
  assert.throws(() => readLayout('{"summary":{"caption":""},"items":[]}'), /layoutFormat/);
});
