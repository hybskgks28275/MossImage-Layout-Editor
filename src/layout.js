import { normalize } from './editor/model.js';

export const DEFAULT_SIZE = 1024;
export const MAX_SIZE = 16384;

export function isSize(value) {
  return Number.isInteger(value) && value >= 64 && value <= MAX_SIZE && value % 16 === 0;
}

export function readLayout(raw, fallback = { width: DEFAULT_SIZE, height: DEFAULT_SIZE }) {
  const state = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (state?.version !== 1 || !Array.isArray(state.boxes) || state.boxes.length > 512) throw new Error('layoutFormat');
  const stored = isSize(state.width) && isSize(state.height);
  // Legacy node exports omit dimensions. Keep the current size, expanding only
  // if a box would otherwise be clipped before the user can inspect it.
  const dimension = (key, offset) => {
    if (stored) return state[key];
    const edge = state.boxes.reduce((max, box) => {
      const end = Math.max(box?.[offset], box?.[offset] + box?.[key]);
      return Number.isFinite(end) ? Math.max(max, end) : max;
    }, fallback[key]);
    return Math.min(MAX_SIZE, Math.ceil(edge / 16) * 16);
  };
  const width = dimension('width', 'x');
  const height = dimension('height', 'y');
  if (state.boxes.some(b => b && (Math.max(b.x, b.x + b.width) > width || Math.max(b.y, b.y + b.height) > height))) {
    throw new Error('layoutBounds');
  }
  const layout = normalize(state, width, height);
  return { layout, width, height, stored, caption: typeof state.prompt === 'string' ? state.prompt : '',
    characters: typeof state.character_boxes === 'string' ? state.character_boxes : '' };
}

export function saveLayout(layout, { width, height, caption, characters }) {
  return JSON.stringify({ ...layout, width, height, prompt: caption, character_boxes: characters }, null, 2) + '\n';
}

function roundEven(n) {
  const floor = Math.floor(n);
  return n - floor === 0.5 ? floor + floor % 2 : Math.round(n);
}

export function buildPrompt(layout, { width, height, caption, characters }) {
  const digits = characters.normalize('NFKC');
  const selected = new Set((digits.match(/\d+/g) ?? []).map(Number));
  // Match the node's 0–1000 conversion and then MOSS-Image Layout Prompt.
  const edge = (value, size, end) => {
    const normalized = roundEven(value / size * 1000);
    return (end ? Math.ceil : Math.floor)(normalized * size / 1000) - size / 2;
  };
  return {
    summary: { caption: caption.trim() },
    items: layout.boxes.map((box, index) => ({
      label: box.type === 'text' ? 'text' : selected.has(index + 1) ? 'character' : 'object',
      caption: box.desc,
      ...(box.type === 'text' ? { text: box.text } : {}),
      ...(box.palette.length ? { palette: box.palette } : {}),
      bbox: [edge(box.y, height, false), edge(box.x, width, false),
        edge(box.y + box.height, height, true), edge(box.x + box.width, width, true)],
    })),
    bbox_coord_space: 'abs_centralized',
    bbox_format: 'yxyx',
  };
}
