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
  start: 'Rodzic: przytrzymaj, aby zacząć',
  introFirst: 'Najpierw budujemy tor.',
  then: 'Potem:',
  go: 'Jedziemy',
  pause: 'Pauza (rodzic: przytrzymaj)',
  continue: 'Dalej',
  endSession: 'Kończymy na dziś',
  helper: 'Pomocnik',
  lamp: 'Lampka',
  board: 'Tor',
  tray: 'Kawałki toru',
  piece_straight: 'Prosty tor',
  piece_curve: 'Zakręt',
  piece_bridge: 'Most',
  piece_tunnel: 'Tunel',
  progress: 'Postęp',
  progressBoards: 'Ułożone plansze',
  progressRecent: 'Ostatnie sesje (samodzielnie / z pomocą)',
  progressNone: 'Jeszcze nie było sesji.',
  endTitle: 'Koniec.',
  endNow: 'Teraz:',
  lockedTitle: 'Tor na dziś gotowy.',
  lockedSub: 'Pobawimy się jutro.',
  parentHoldHint: 'Po zabawie gra jest zablokowana do jutra. Żeby odblokować wcześniej, przytrzymaj napis na górze ekranu przez 3 s.',
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
  start: 'Pais: manter premido para começar',
  introFirst: 'Primeiro construímos a linha.',
  then: 'Depois:',
  go: 'Vamos',
  pause: 'Pausa (pais: manter premido)',
  continue: 'Continuar',
  endSession: 'Acabamos por hoje',
  helper: 'Ajudante',
  lamp: 'Lâmpada',
  board: 'Linha',
  tray: 'Peças da linha',
  piece_straight: 'Linha reta',
  piece_curve: 'Curva',
  piece_bridge: 'Ponte',
  piece_tunnel: 'Túnel',
  progress: 'Progresso',
  progressBoards: 'Tabuleiros feitos',
  progressRecent: 'Últimas sessões (sozinho / com ajuda)',
  progressNone: 'Ainda não houve sessões.',
  endTitle: 'Fim.',
  endNow: 'Agora:',
  lockedTitle: 'A linha de hoje está pronta.',
  lockedSub: 'Brincamos amanhã.',
  parentHoldHint: 'Depois de jogar, o jogo fica bloqueado até amanhã. Para desbloquear antes, mantenham premido o título no topo do ecrã durante 3 s.',
  offline: 'Funciona sem internet.',
};

export const STRINGS: Record<Lang, Record<StringKey, string>> = { pl, pt };

export type T = (key: StringKey) => string;

export function translator(lang: Lang): T {
  const table = STRINGS[lang] ?? STRINGS.pl;
  return (key) => table[key];
}
