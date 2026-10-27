import { createIndex, highlight, search, type FzyIndex, type SearchOptions } from 'fzy-search';
import { DATASETS, type Dataset, type Row } from './datasets.ts';
import './style.css';

type Mode = 'filter' | 'typo';
type Options = { -readonly [K in keyof SearchOptions]-?: NonNullable<SearchOptions[K]> };

// The library's own defaults, and the "is this word a misspelling of a name?" preset from the readme.
const DEFAULTS: Options = {
  limit: 20,
  prefix: true,
  infix: true,
  maxEdits: Infinity,
  minTypoLength: 0,
  keepInitial: false,
  minCoverage: 0,
  minScore: -Infinity,
};
const PRESETS: Record<Mode, Options> = {
  filter: { ...DEFAULTS },
  typo: {
    ...DEFAULTS,
    prefix: false,
    infix: false,
    maxEdits: 1,
    minTypoLength: 6,
    keepInitial: true,
    minCoverage: 0.8,
    limit: 1,
  },
};
const LIBRARY_DEFAULT_LIMIT = Infinity;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const input = $<HTMLInputElement>('#query');
const datasetSelect = $<HTMLSelectElement>('#dataset');
const results = $<HTMLOListElement>('#results');
const stats = $<HTMLParagraphElement>('#stats');
const spark = $<HTMLElement>('#spark').querySelector('polyline')!;
const snippet = $<HTMLElement>('#snippet');
const examples = $<HTMLParagraphElement>('#examples');

let dataset: Dataset = DATASETS[0];
let index: FzyIndex<Row> | null = null;
let rowCount = 0;
let buildMs = 0;
let mode: Mode = 'filter';
let options: Options = { ...PRESETS.filter };
const timings: number[] = [];

// --- state in the URL: every search is a link ---------------------------------------
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  dataset = DATASETS.find((d) => d.id === params.get('list')) ?? DATASETS[0];
  mode = params.get('mode') === 'typo' ? 'typo' : 'filter';
  options = { ...PRESETS[mode] };
  input.value = params.get('q') ?? '';
}
function writeHash() {
  const params = new URLSearchParams();
  if (input.value) params.set('q', input.value);
  if (dataset !== DATASETS[0]) params.set('list', dataset.id);
  if (mode !== 'filter') params.set('mode', mode);
  history.replaceState(null, '', params.size ? `#${params}` : location.pathname);
}

// --- loading and indexing -------------------------------------------------------------
async function load(next: Dataset) {
  dataset = next;
  index = null;
  stats.textContent = `Loading ${next.label}…`;
  results.replaceChildren();
  let rows: Row[];
  try {
    rows = await next.load();
  } catch (error) {
    stats.textContent = `Could not load the list: ${(error as Error).message}`;
    return;
  }
  if (dataset !== next) return; // the user picked another list meanwhile
  stats.textContent = `Indexing ${rows.length.toLocaleString('en')} rows…`;
  await new Promise(requestAnimationFrame); // paint the message before the synchronous build
  const start = performance.now();
  index = createIndex(rows, 'name');
  buildMs = performance.now() - start;
  rowCount = rows.length;
  timings.length = 0;
  $<HTMLElement>('#source').textContent = next.source;
  renderExamples();
  run();
}

// --- the search, timed ----------------------------------------------------------------
function run() {
  writeHash();
  renderSnippet();
  if (!index) return;
  const query = input.value;
  const start = performance.now();
  const hits = search(query, index, options);
  const ms = performance.now() - start;

  if (query.trim()) {
    timings.push(ms);
    if (timings.length > 60) timings.shift();
  }
  const fragment = document.createDocumentFragment();
  for (const hit of hits) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'label';
    // highlight() HTML-escapes everything outside the <mark> tags it adds.
    label.innerHTML = highlight(query, index, hit.i);
    li.append(label);
    if (hit.item.meta) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = hit.item.meta;
      li.append(meta);
    }
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = hit.score >= 800 ? Math.round(hit.score).toString() : hit.score.toFixed(1);
    score.title = 'score: 1000 exact, 900 prefix, 800 substring, up to 170 per word';
    li.append(score);
    fragment.append(li);
  }
  results.replaceChildren(fragment);
  renderStats(query, hits.length, ms);
}

function renderStats(query: string, found: number, ms: number) {
  const rows = rowCount.toLocaleString('en');
  const built = `index built in ${Math.round(buildMs)} ms`;
  if (!query.trim()) {
    stats.textContent = `${rows} rows, ${built}. Start typing.`;
  } else {
    const sorted = timings.slice().sort((a, b) => a - b);
    const p50 = sorted[sorted.length >> 1];
    const what = found ? `${found} result${found === 1 ? '' : 's'}` : 'No result';
    stats.textContent = `${what} in ${fmt(ms)} over ${rows} rows · p50 ${fmt(p50)} over your last ${timings.length} keystroke${timings.length === 1 ? '' : 's'} · ${built}`;
  }
  // A line needs a few points before it says anything.
  spark.parentElement!.style.visibility = timings.length >= 5 ? 'visible' : 'hidden';
  const max = Math.max(...timings, 0.05);
  spark.setAttribute(
    'points',
    timings.map((t, i) => `${(i / 59) * 120},${(22 - (t / max) * 20).toFixed(1)}`).join(' '),
  );
}

// Browsers round performance.now() to 0.1 ms without cross-origin isolation, which GitHub Pages
// cannot turn on: print no more precision than the clock has.
const fmt = (ms: number) => (ms < 0.1 ? '< 0.1 ms' : `${ms.toFixed(1)} ms`);

// --- the code for this search ---------------------------------------------------------
function renderSnippet() {
  const changed = (Object.keys(options) as (keyof Options)[])
    .filter((k) => options[k] !== (k === 'limit' ? LIBRARY_DEFAULT_LIMIT : DEFAULTS[k]))
    .map((k) => `${k}: ${String(options[k])}`);
  const quoted = `'${input.value.replace(/['\\]/g, '\\$&')}'`;
  const args = changed.length <= 2 ? `{ ${changed.join(', ')} }` : `{\n  ${changed.join(',\n  ')},\n}`;
  snippet.textContent = [
    `import { createIndex, search, highlight } from 'fzy-search';`,
    ``,
    `const index = ${dataset.index}; // once`,
    `const hits = search(${quoted}, index${changed.length ? `, ${args}` : ''});`,
  ].join('\n');
}

function renderExamples() {
  if (!dataset.examples[mode].length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'try it on the English words';
    button.addEventListener('click', () => {
      datasetSelect.value = 'words';
      void load(DATASETS.find((d) => d.id === 'words')!);
    });
    examples.replaceChildren(
      'This preset asks “is this word a misspelling of one of these names?”: the word must cover 80 % of a row, which long rows never reach. ',
      button,
      '.',
    );
    return;
  }
  examples.replaceChildren(
    'Try ',
    ...dataset.examples[mode].flatMap((q, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = q;
      button.addEventListener('click', () => {
        input.value = q;
        input.focus();
        run();
      });
      return i ? [' ', button] : [button];
    }),
  );
}

// --- controls -------------------------------------------------------------------------
const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-opt]')];
function syncControls() {
  for (const control of controls) {
    const key = control.dataset.opt as keyof Options;
    const value = options[key];
    if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = value as boolean;
    else control.value = value === -Infinity ? '' : String(value);
  }
  for (const output of document.querySelectorAll<HTMLOutputElement>('output[data-for]'))
    output.value = String(options[output.dataset.for as keyof Options]);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    button.setAttribute('aria-checked', String(button.dataset.mode === mode));
}
for (const control of controls) {
  control.addEventListener('input', () => {
    const key = control.dataset.opt as keyof Options;
    const raw = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value;
    const value = typeof raw === 'boolean' ? raw : raw === '' ? DEFAULTS[key] : Number(raw);
    options = { ...options, [key]: value };
    syncControls();
    run();
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => {
    mode = button.dataset.mode as Mode;
    options = { ...PRESETS[mode] };
    syncControls();
    renderExamples();
    run();
  });
}

datasetSelect.append(...DATASETS.map((d) => new Option(d.label, d.id)));
datasetSelect.addEventListener('change', () => void load(DATASETS.find((d) => d.id === datasetSelect.value)!));
input.addEventListener('input', run);
$<HTMLButtonElement>('#copy').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(snippet.textContent ?? '');
  const button = event.currentTarget as HTMLButtonElement;
  button.textContent = 'Copied';
  setTimeout(() => (button.textContent = 'Copy'), 1200);
});

$<HTMLElement>('#version').textContent = `v${__FZY_VERSION__}`;
$<HTMLElement>('#size').textContent = `${__FZY_SIZE__} kB gzipped`;
$<HTMLElement>('#size-lede').textContent = `${__FZY_SIZE__} kB`;

// A pasted or edited link: take its state, and reload the list only if it changed.
addEventListener('hashchange', () => {
  const previous = dataset;
  readHash();
  datasetSelect.value = dataset.id;
  syncControls();
  if (dataset === previous) {
    renderExamples();
    run();
  } else void load(dataset);
});

readHash();
datasetSelect.value = dataset.id;
syncControls();
input.focus();
void load(dataset);
