// All UI text. One language per session: chosen by the parent in settings
// before a session starts and never switched mid-session.

export type Lang = 'pl' | 'pt';
export const LANGS: readonly Lang[] = ['pl', 'pt'];

export type CardId = 'bath' | 'meal' | 'walk' | 'book';
export const CARD_IDS: readonly CardId[] = ['bath', 'meal', 'walk', 'book'];

const pl = {
  appTitle: 'Budujemy Tor',
  setupHeading: 'Co potem?',
  setupHint: 'Wybierz, co będzie po zabawie.',
  card_bath: 'Kąpiel',
  card_meal: 'Jedzenie',
  card_walk: 'Spacer',
  card_book: 'Książka',
  addPhoto: 'Dodaj zdjęcie',
  changePhoto: 'Zmień zdjęcie',
  removePhoto: 'Usuń zdjęcie',
  photoLocal: 'Zdjęcie zostaje tylko na tym telefonie.',
  settings: 'Ustawienia rodzica',
  sound: 'Dźwięk',
  soundOn: 'Włączony (cichy)',
  soundOff: 'Wyłączony',
  language: 'Język',
  start: 'Dalej',
  introFirst: 'Najpierw budujemy tor.',
  then: 'Potem:',
  go: 'Budujemy!',
  childTurn: 'Tura dziecka',
  parentTurn: 'Tura rodzica',
  waiting: 'Chwilka…',
  yourMove: 'Przeciągnij kawałek toru',
  fixTogether: 'Naprawiamy razem!',
  fixHint: 'Dotknijcie mostu — oboje.',
  bridgeHint: 'Ups, most! Połóż go.',
  wagonsLeft: 'Pozostałe tury',
  ride: 'Jedziemy!',
  endTitle: 'Koniec.',
  endNow: 'Teraz:',
  lockedTitle: 'Tor na dziś gotowy.',
  lockedSub: 'Pobawimy się jutro.',
  parentHold: 'Rodzic: przytrzymaj 3 s',
  tile_left: 'Zakręt w lewo',
  tile_straight: 'Prosto',
  tile_right: 'Zakręt w prawo',
  offline: 'Działa bez internetu.',
};

export type StringKey = keyof typeof pl;

const pt: Record<StringKey, string> = {
  appTitle: 'Budujemy Tor',
  setupHeading: 'E depois?',
  setupHint: 'Escolhe o que vem depois da brincadeira.',
  card_bath: 'Banho',
  card_meal: 'Comer',
  card_walk: 'Passeio',
  card_book: 'Livro',
  addPhoto: 'Adicionar foto',
  changePhoto: 'Mudar foto',
  removePhoto: 'Remover foto',
  photoLocal: 'A foto fica só neste telemóvel.',
  settings: 'Definições dos pais',
  sound: 'Som',
  soundOn: 'Ligado (baixinho)',
  soundOff: 'Desligado',
  language: 'Idioma',
  start: 'Continuar',
  introFirst: 'Primeiro construímos a linha.',
  then: 'Depois:',
  go: 'Vamos construir!',
  childTurn: 'Vez da criança',
  parentTurn: 'Vez do pai/mãe',
  waiting: 'Um momento…',
  yourMove: 'Arrasta um bocado de linha',
  fixTogether: 'Vamos arranjar juntos!',
  fixHint: 'Toquem na ponte — os dois.',
  bridgeHint: 'Ups, uma ponte! Põe-na.',
  wagonsLeft: 'Vezes que faltam',
  ride: 'Vamos lá!',
  endTitle: 'Fim.',
  endNow: 'Agora:',
  lockedTitle: 'A linha de hoje está pronta.',
  lockedSub: 'Brincamos amanhã.',
  parentHold: 'Pais: manter premido 3 s',
  tile_left: 'Curva à esquerda',
  tile_straight: 'Em frente',
  tile_right: 'Curva à direita',
  offline: 'Funciona sem internet.',
};

export const STRINGS: Record<Lang, Record<StringKey, string>> = { pl, pt };

export type T = (key: StringKey) => string;

export function translator(lang: Lang): T {
  const table = STRINGS[lang] ?? STRINGS.pl;
  return (key) => table[key];
}
