// Deterministic generator of a realistic French "formations" corpus.
// Long, accented, multi-word labels — the shape this engine was written for.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIPLOMAS = [
  'BTS', 'BUT', 'Licence', 'Licence professionnelle', 'Master', 'Master of Science',
  'Diplôme d’État', 'Diplôme universitaire', 'Bachelor', 'Classe préparatoire',
  'DUT', 'DEUST', 'Mastère spécialisé', 'Titre professionnel', 'CAP', 'Doctorat',
];

const FIELDS = [
  'Sciences de la vie', 'Sciences de l’éducation', 'Sciences économiques et sociales',
  'Informatique', 'Génie civil', 'Génie électrique et informatique industrielle',
  'Droit', 'Droit des affaires', 'Économie et gestion', 'Management commercial opérationnel',
  'Métiers de l’électricité et de ses environnements connectés', 'Comptabilité et gestion',
  'Mathématiques appliquées', 'Physique-chimie', 'Chimie analytique', 'Biologie moléculaire',
  'Histoire de l’art', 'Langues étrangères appliquées', 'Lettres modernes',
  'Psychologie clinique', 'Sociologie', 'Géographie et aménagement', 'Sciences politiques',
  'Ingénierie logicielle', 'Réseaux et télécommunications', 'Cybersécurité',
  'Intelligence artificielle', 'Science des données', 'Statistique et informatique décisionnelle',
  'Métiers du multimédia et de l’internet', 'Communication des organisations',
  'Journalisme', 'Ressources humaines', 'Marketing digital', 'Commerce international',
  'Logistique et transport', 'Hôtellerie-restauration', 'Tourisme', 'Immobilier',
  'Agronomie', 'Agriculture biologique', 'Œnologie', 'Nutrition et diététique',
  'Kinésithérapie', 'Soins infirmiers', 'Ergothérapie', 'Orthophonie', 'Pharmacie',
  'Architecture intérieure', 'Design graphique', 'Arts appliqués', 'Cinéma et audiovisuel',
  'Musicologie', 'Éducation physique et sportive', 'Management du sport',
  'Énergies renouvelables', 'Environnement et développement durable', 'Écologie appliquée',
  'Mécanique et matériaux', 'Aéronautique', 'Maintenance industrielle', 'Robotique',
];

const SPECIALTIES = [
  'parcours Data engineering', 'parcours Fiscalité internationale', 'parcours Recherche',
  'option Systèmes embarqués', 'option Développement web', 'spécialité Audit et conseil',
  'spécialité Finance de marché', 'parcours Innovation et entrepreneuriat',
  'parcours Ville durable', 'option Réalité virtuelle', 'parcours Santé publique',
  'spécialité Gestion de projet', 'parcours Traduction spécialisée', 'option Bâtiment',
  'parcours Économie sociale et solidaire', 'option Cloud et DevOps',
  'parcours Sciences cognitives', 'spécialité Droit du numérique', '',
  '', '', '', 'parcours Alternance', 'option International',
];

const SCHOOLS = [
  'Université de Bordeaux', 'Université Paris-Saclay', 'Université de Strasbourg',
  'Université Grenoble Alpes', 'Sorbonne Université', 'Université de Lille',
  'Université Toulouse Capitole', 'Université Lumière Lyon 2', 'Aix-Marseille Université',
  'Université de Rennes', 'Université de Nantes', 'Université Côte d’Azur',
  'INSA Lyon', 'IMT Atlantique', 'CentraleSupélec', 'Arts et Métiers ParisTech',
  'ESIEE Paris', 'Polytech Montpellier', 'IUT de Cachan', 'IUT Nancy-Charlemagne',
  'Lycée Louis-le-Grand', 'Lycée Henri-IV', 'ESSEC Business School', 'EM Lyon',
  'Sciences Po Grenoble', 'ENSAI Rennes', 'ISEN Brest', 'EPITECH Toulouse',
];


const CITIES = ('Paris Lyon Marseille Toulouse Nice Nantes Montpellier Strasbourg Bordeaux Lille Rennes Reims '
  + 'Saint-Étienne Le Havre Toulon Grenoble Dijon Angers Nîmes Villeurbanne Clermont-Ferrand Le Mans Aix-en-Provence '
  + 'Brest Tours Amiens Limoges Annecy Perpignan Boulogne-Billancourt Metz Besançon Orléans Rouen Argenteuil '
  + 'Mulhouse Montreuil Caen Nancy Tourcoing Roubaix Nanterre Vitry-sur-Seine Créteil Avignon Poitiers Dunkerque '
  + 'Aubervilliers Versailles Colombes Aulnay-sous-Bois Asnières-sur-Seine Saint-Denis Courbevoie Cherbourg '
  + 'Rueil-Malmaison Pau La Rochelle Champigny-sur-Marne Antibes Saint-Maur-des-Fossés Cannes Calais Béziers '
  + 'Colmar Bourges Drancy Mérignac Ajaccio Saint-Nazaire Issy-les-Moulineaux Noisy-le-Grand Évry Cergy Pessac '
  + 'Vénissieux Clichy Levallois-Perret Troyes Neuilly-sur-Seine Antony Sarcelles Niort Lorient Chambéry '
  + 'Saint-Quentin Beauvais Hyères Épinay-sur-Seine Meaux Chelles Fontenay-sous-Bois Valence Bayonne Montauban '
  + 'Cholet Narbonne Fréjus Sartrouville Arles Belfort Bastia Vannes Charleville-Mézières Laval Albi Évreux '
  + 'Salon-de-Provence Sète Blois Chalon-sur-Saône Angoulême Tarbes Compiègne Gap Auxerre Périgueux Agen '
  + 'Roanne Béthune Cambrai Douai Épinal Alès Rodez Vichy Montélimar Draguignan Saint-Brieuc Quimper Nevers '
  + 'Châteauroux Bourg-en-Bresse Thionville Haguenau Saint-Malo Cahors Carcassonne Mâcon Dieppe Vierzon '
  + 'Villefranche-sur-Saône Aurillac Bergerac Biarritz Castres Chartres Colmar Dax Fougères Guéret Issoire '
  + 'Lens Lisieux Longwy Millau Moulins Pontivy Provins Redon Rochefort Royan Sablé Saintes Sedan Thiers Vesoul').split(' ');

const ESTAB = ['Université', 'IUT', 'Lycée', 'Institut', 'École supérieure', 'CFA', 'Campus', 'Pôle universitaire',
  'École nationale', 'Institut catholique', 'GRETA', 'MFR', 'ISFEC', 'CNAM'];

const MENTIONS = ['', '', '', 'en apprentissage', 'à distance', 'en alternance', 'formation continue',
  'première année', 'deuxième année', 'cursus intégré', 'double diplôme', 'année de césure'];

export function buildCorpus(size = 20000, seed = 42) {
  const rnd = mulberry32(seed);
  const seen = new Set();
  const items = [];
  let guard = 0;
  while (items.length < size && guard++ < size * 40) {
    const d = DIPLOMAS[(rnd() * DIPLOMAS.length) | 0];
    const f = FIELDS[(rnd() * FIELDS.length) | 0];
    const s = SPECIALTIES[(rnd() * SPECIALTIES.length) | 0];
    const sc = rnd() < 0.35
      ? SCHOOLS[(rnd() * SCHOOLS.length) | 0]
      : `${ESTAB[(rnd() * ESTAB.length) | 0]} de ${CITIES[(rnd() * CITIES.length) | 0]}`;
    const m = MENTIONS[(rnd() * MENTIONS.length) | 0];
    const name = [d, f, s, m, '-', sc].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    if (seen.has(name)) continue;
    seen.add(name);
    items.push({ id: items.length, name });
  }
  return items;
}
