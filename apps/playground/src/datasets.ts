export type Row = { id: number | string; name: string; meta?: string };

export type Dataset = {
  id: string;
  label: string;
  /** Where the rows come from, shown in the footer. */
  source: string;
  load: () => Promise<Row[]>;
  /** What `createIndex` is given, as code for the snippet: the rows' own shape, not this page's. */
  index: string;
  /** Queries worth trying, as a human would type them. */
  examples: { filter: string[]; typo: string[] };
};

// The lists other fuzzy search libraries are judged on, fetched from their repositories at a pinned commit:
// nothing is copied here, and jsDelivr serves them compressed and cached.
const UFUZZY =
  'https://cdn.jsdelivr.net/gh/leeoniya/uFuzzy@9bcdc090f426cadaa2865b7f3dc548f2bb4a54f0/demos/testdata.json';
const FUSE = 'https://cdn.jsdelivr.net/gh/krisk/Fuse@edf2fb608eca0461508d1d71317e6e58309ffada/test/fixtures/books.json';

const json = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return (await response.json()) as T;
};

// uFuzzy's testdata.json: one file, 4 MB (950 kB over the wire), shared by every list below.
type Corpus = Record<string, string[]>;
let corpus: Promise<Corpus> | undefined;
const fromCorpus = async (lists: readonly string[]): Promise<Row[]> => {
  corpus ??= json<Corpus>(UFUZZY).catch((error: unknown) => {
    corpus = undefined; // a failed fetch is retried on the next pick
    throw error;
  });
  const data = await corpus;
  return lists.flatMap((list) => data[list] ?? []).map((name, id) => ({ id, name }));
};

const ufuzzySource =
  'uFuzzy’s comparison corpus (github.com/leeoniya/uFuzzy, MIT), the lists its demo races about 25 libraries on';
// Every list uFuzzy's compare page selects by default: 161,844 strings.
const ALL = [
  'urls_and_titles_600',
  'hearthstone_750',
  'metric_name_9000',
  'metric_type_9000',
  'metric_help_9000',
  'ue4_files_13000',
  'mtg_16000',
  'steam_games_47000',
  'wordlist_58000',
];
const ufuzzy = (id: string, label: string, lists: string[], examples: Dataset['examples']): Dataset => ({
  id,
  label,
  source: ufuzzySource,
  load: () => fromCorpus(lists),
  index: `createIndex(strings)`,
  examples,
});

type Book = { title: string; author: { firstName: string; lastName: string } };
type Commune = { nom: string; code: string; codeDepartement: string; population?: number };

export const DATASETS: Dataset[] = [
  // uFuzzy's benchmark types and deletes these terms, one keystroke at a time, on every library it compares.
  ufuzzy('ufuzzy', '161,844 strings, uFuzzy’s benchmark corpus', ALL, {
    filter: ['super ma', 'twil', 'prom rem stor', 'chest', 'mania', 'puzz', 'test'],
    typo: ['recieve', 'definately', 'accomodate', 'terarria', 'fierball'],
  }),
  ufuzzy('steam', '46,711 Steam games', ['steam_games_47000'], {
    filter: ['super ma', 'half lif', 'counter strik', 'grand theft', 'witcher', 'portl'],
    typo: ['terarria', 'factroio', 'rimwold', 'cuphed', 'stardw valley'],
  }),
  ufuzzy('words', '58,110 English words', ['wordlist_58000'], {
    filter: ['xylo', 'quack', 'aard'],
    typo: ['recieve', 'definately', 'seperate', 'accomodate', 'occurence', 'goverment'],
  }),
  ufuzzy('mtg', '15,893 Magic: The Gathering cards', ['mtg_16000'], {
    filter: ['black lotus', 'lightnin bolt', 'serra angle', 'jace mind', 'ancestral'],
    typo: ['counterspel', 'birds of paradice'],
  }),
  ufuzzy('ue4', '13,164 Unreal Engine 4 source files', ['ue4_files_13000'], {
    filter: ['actorcomp', 'skelmesh', 'gameplay ability', 'niagra'],
    typo: ['playercontroler', 'skeletalmesh'],
  }),
  ufuzzy('metrics', '8,876 Prometheus metric names', ['metric_name_9000'], {
    filter: ['prom rem stor', 'http req dur', 'mem avail', 'cpu usage'],
    typo: [],
  }),
  ufuzzy('hearthstone', '743 Hearthstone cards', ['hearthstone_750'], {
    filter: ['moo', 'leroy', 'ragnaros', 'abusive'],
    typo: ['fierball', 'frostblot', 'flamestrke'],
  }),
  {
    id: 'books',
    label: '23 books, the Fuse.js sample',
    source: 'Books: the sample list of Fuse.js (github.com/krisk/Fuse, Apache-2.0)',
    load: async () =>
      (await json<Book[]>(FUSE)).map((b, id) => ({
        id,
        name: `${b.title} · ${b.author.firstName} ${b.author.lastName}`,
      })),
    index: 'createIndex(books, (b) => `${b.title} ${b.author.firstName} ${b.author.lastName}`)',
    examples: {
      filter: ['woodhouse', 'hamiltn', 'steve lock', 'dan brwn', 'silmarilion'],
      typo: [],
    },
  },
  {
    id: 'communes',
    label: '34,969 French communes (accents)',
    source: 'Communes: geo.api.gouv.fr, Licence Ouverte',
    load: async () =>
      (await json<Commune[]>('https://geo.api.gouv.fr/communes?fields=nom,codeDepartement,population')).map((c) => ({
        id: c.code,
        name: c.nom,
        meta: `${c.codeDepartement}${c.population ? ` · ${c.population.toLocaleString('fr')} hab.` : ''}`,
      })),
    index: `createIndex(communes, 'nom')`,
    examples: {
      filter: ['st etienne', 'chalon sur saone', 'aix provence', 'clermon ferand', 'montpelier'],
      typo: ['renned', 'avginon', 'besancn', 'bordeax', 'commerce'],
    },
  },
];
