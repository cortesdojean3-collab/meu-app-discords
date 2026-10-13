'use strict';

// Calendar arithmetic belongs on the server. The browser receives release times,
// never the text of a letter whose date has not arrived.
const DAY = 86400000;
const FLOWER_IDS = ['flower-rose', 'flower-daisy', 'flower-tulip', 'flower-lavender', 'flower-gold'];
const FEATURE_IDS = ['garden', 'letters', 'delivery', 'heart', 'constellation', 'special', 'finale', 'intro', 'decorations'];
const DISCOVERIES = [...FLOWER_IDS, 'special', 'constellation', 'delivery', 'heart'];
const letterTexts = [
  'Às vezes, tudo o que precisamos é de um encontro inesperado.',
  'Tem gente que transforma um dia comum em uma lembrança inesquecível.',
  'Se carinho fosse flor, hoje eu teria um jardim inteiro para entregar.',
  'Não é sobre quanto tempo passou. É sobre o quanto esse encontro significou.',
  'Algumas conexões fazem o mundo parecer um lugar mais bonito.',
  'Uma mensagem, uma conversa, um sorriso... Toda grande história começa em algum lugar.',
  'Há pessoas que fazem até o silêncio parecer confortável.',
  'Gosto de pensar que cada conversa nossa plantou uma flor que continua crescendo.',
  'O carinho também mora nas coisas pequenas: lembrar, perguntar e estar por perto.',
  'Hoje, este envelope leva um abraço leve, daqueles que deixam o dia mais tranquilo.',
  'Há lembranças que sorriem para a gente mesmo depois de muito tempo.',
  'Que a gente encontre sempre um cantinho de calma no meio dos dias corridos.',
  'Se pudesse embrulhar uma manhã bonita, eu deixaria uma na sua janela.',
  'A melhor parte de uma história é poder continuar conhecendo quem caminha com a gente.',
  'Metade destes envelopes já abriu. O carinho que eles carregam continua inteiro.',
  'Um jardim cresce com cuidado. As boas lembranças também.',
  'Espero que hoje alguma coisa simples te faça sorrir sem pressa.',
  'Existem encontros que viram companhia até quando a distância aparece.',
  'Cada flor aqui guarda um jeito pequeno de dizer: você é especial.',
  'Gosto das histórias que a gente conta e das que ainda nem imaginou viver.',
  'Que nunca nos falte curiosidade para descobrir novos motivos de alegria.',
  'Às vezes, uma palavra carinhosa é a luz de que um dia precisava.',
  'Este envelope tem cheiro de flor e vontade de te desejar uma tarde bonita.',
  'Guardo com cuidado os detalhes que fizeram nossos caminhos se reconhecerem.',
  'Uma boa companhia faz até os dias comuns terem algo para lembrar.',
  'Que a vida continue oferecendo espaço para nossos sonhos florescerem.',
  'Há muito carinho nas lembranças, e ainda cabe mais nos dias que virão.',
  'Se hoje o mundo estiver barulhento, aqui fica um pouquinho de paz para você.',
  'Quase chegamos ao último envelope. Que estas flores continuem fazendo companhia.',
  'Trinta pequenos gestos, uma história especial e muitas páginas bonitas pela frente. 💜'
];

function defaults() {
  return {
    enabled: false, startsAt: null, endsAt: null, timeZone: 'America/Sao_Paulo',
    title: 'Nosso Pequeno Infinito — 3 Anos de Nós',
    subtitle: 'Há três anos, duas histórias se encontraram. E desde então, o mundo ganhou um pouquinho mais de cor.',
    mainText: 'Três anos atrás, o destino fez algo especial: colocou duas pessoas no mesmo caminho.\n\nTalvez naquele momento ninguém soubesse o quanto esse encontro seria importante.\n\nMas algumas histórias começam assim, de um jeito simples, e acabam se tornando uma das partes mais bonitas da nossa vida.\n\nEssa pequena comemoração é para lembrar que existem encontros que mudam tudo.\n\nFeliz 3 anos desde o nosso primeiro encontro de caminhos. 💜',
    names: { you: '', partner: '' }, publishNames: false, meetingDate: null, publishMeetingDate: false,
    allowMemories: false,
    flowers: [
      { id: 'flower-rose', name: 'Rosa lilás', text: 'Algumas pessoas chegam devagar e acabam se tornando nosso lugar favorito.' },
      { id: 'flower-daisy', name: 'Margarida branca', text: 'Três anos podem parecer muito tempo, mas alguns encontros continuam parecendo mágicos.' },
      { id: 'flower-tulip', name: 'Tulipa rosa', text: 'Entre tantos caminhos possíveis, que sorte a vida ter cruzado os nossos.' },
      { id: 'flower-lavender', name: 'Lavanda', text: 'Que nunca faltem motivos para sorrir, flores para oferecer e histórias para contar.' },
      { id: 'flower-gold', name: 'Flor dourada', text: 'Se eu pudesse escolher um instante para guardar para sempre, escolheria aquele em que tudo começou.' }
    ],
    letters: letterTexts.map((text, index) => ({ day: index + 1, text })),
    messages: {
      delivery: 'Entrega especial! Alguém mandou flores para deixar seu dia mais bonito. 💐',
      heart: 'O mundo tem bilhões de pessoas, mas alguns encontros parecem ter sido escritos nas estrelas. 💜',
      constellation: 'Se o universo pudesse guardar uma lembrança, eu pediria que guardasse o dia em que te conheci.',
      special: 'Se alguém me perguntasse o que mudou há três anos, talvez eu nem soubesse explicar tudo.\n\nMas sei que, desde que nossos caminhos se encontraram, existem lembranças que eu não trocaria por nada.\n\nE se hoje existe uma flor especial escondida aqui, é porque algumas pessoas merecem muito mais do que palavras.\n\nMerecem um jardim inteiro.\n\nFeliz três anos desde que te conheci. 💜',
      finale: 'Três anos.\n\nTrês anos desde aquele encontro que, talvez sem a gente perceber, se tornaria tão importante.\n\nNesse tempo, a vida mudou, os dias passaram e muitas histórias foram escritas.\n\nMas algumas lembranças continuam guardadas no mesmo lugar especial.\n\nObrigado por fazer parte dessa história.\n\nE, se depender do carinho que existe nela, ainda teremos muitas páginas bonitas pela frente.\n\nFeliz três anos desde que nossos caminhos se cruzaram.\n\nCom todo o meu carinho. 💜'
    },
    features: Object.fromEntries(FEATURE_IDS.map(key => [key, true])),
    colors: { primary: '#9b83e8', pink: '#edb6d2', gold: '#efd59a' },
    decorations: { petals: true, stars: true, flowers: true }
  };
}

function eventError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function text(value, label, max, { empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw eventError(`${label}: texto inválido ou maior que ${max} caracteres.`);
  return value.trim();
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw eventError(`${label}: formato inválido.`);
  return value;
}
function bool(value, label) { if (typeof value !== 'boolean') throw eventError(`${label}: escolha inválida.`); return value; }
function dateOnly(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw eventError(`${label}: use AAAA-MM-DD.`);
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw eventError(`${label}: data inexistente.`);
  return value;
}
function timestamp(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw eventError(`${label}: informe data, hora e fuso horário.`);
  dateOnly(value.slice(0, 10), label);
  const clock = value.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (+clock[1] > 23 || +clock[2] > 59 || +(clock[3] || 0) > 59) throw eventError(`${label}: hora inválida.`);
  const year = +value.slice(0, 4);
  if (year < 1970 || year > 2200) throw eventError(`${label}: escolha um ano entre 1970 e 2200.`);
  const number = Date.parse(value);
  if (!Number.isFinite(number)) throw eventError(`${label}: data inválida.`);
  return new Date(number).toISOString();
}
const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    try { formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })); }
    catch { throw eventError('Fuso horário inválido. Use um nome como America/Sao_Paulo.'); }
  }
  return formatters.get(timeZone);
}
function localDate(instant, timeZone) {
  const parts = formatter(timeZone).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const ordinal = date => Date.parse(date + 'T00:00:00Z') / DAY;
const addDays = (date, count) => new Date((ordinal(date) + count) * DAY).toISOString().slice(0, 10);
// Find the first real instant of this local date. This also handles zones where
// daylight saving skips midnight; adding 24 hours would release a letter late.
function startOfDate(date, timeZone) {
  const target = ordinal(date);
  let lo = target * DAY - 36 * 3600000, hi = target * DAY + 36 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ordinal(localDate(mid, timeZone)) < target) lo = mid; else hi = mid;
  }
  if (localDate(hi, timeZone) !== date) throw eventError('Esta data não existe no fuso escolhido.');
  return hi;
}
function calendarDates(config) {
  if (!config.startsAt || !config.endsAt) return 0;
  return ordinal(localDate(Date.parse(config.endsAt) - 1, config.timeZone)) - ordinal(localDate(config.startsAt, config.timeZone)) + 1;
}

function normalizeConfig(patch, previous = defaults()) {
  object(patch, 'Configuração');
  const result = JSON.parse(JSON.stringify(previous));
  for (const key of ['enabled', 'publishNames', 'publishMeetingDate', 'allowMemories']) if (key in patch) result[key] = bool(patch[key], key);
  for (const key of ['startsAt', 'endsAt']) if (key in patch) result[key] = timestamp(patch[key], key === 'startsAt' ? 'Início' : 'Encerramento');
  if ('timeZone' in patch) { result.timeZone = text(patch.timeZone, 'Fuso horário', 80); formatter(result.timeZone); }
  if ('meetingDate' in patch) result.meetingDate = dateOnly(patch.meetingDate, 'Data do encontro');
  for (const [key, max] of [['title', 150], ['subtitle', 400], ['mainText', 12000]]) if (key in patch) result[key] = text(patch[key], key, max);
  if ('names' in patch) {
    object(patch.names, 'Nomes');
    for (const key of ['you', 'partner']) if (key in patch.names) result.names[key] = text(patch.names[key], 'Nome', 80, { empty: true });
  }
  if ('letters' in patch) {
    if (!Array.isArray(patch.letters) || patch.letters.length !== 30) throw eventError('Informe os textos das 30 cartas.');
    result.letters = patch.letters.map((letter, index) => {
      if (typeof letter !== 'string' && (!letter || letter.day !== index + 1)) throw eventError('As cartas precisam estar na ordem dos dias 1 a 30.');
      return { day: index + 1, text: text(typeof letter === 'string' ? letter : letter.text, `Carta ${index + 1}`, 4000) };
    });
  }
  if ('flowers' in patch) {
    if (!Array.isArray(patch.flowers) || patch.flowers.length !== 5) throw eventError('Informe as cinco flores do jardim.');
    result.flowers = patch.flowers.map((flower, index) => {
      if (!flower || flower.id !== FLOWER_IDS[index]) throw eventError('Identificação das flores inválida.');
      return { id: flower.id, name: text(flower.name, 'Nome da flor', 80), text: text(flower.text, 'Mensagem da flor', 4000) };
    });
  }
  for (const key of ['features', 'decorations', 'colors', 'messages']) if (key in patch) {
    object(patch[key], key);
    for (const field of Object.keys(result[key])) if (field in patch[key]) {
      const value = patch[key][field];
      if (key === 'features' || key === 'decorations') result[key][field] = bool(value, field);
      else if (key === 'colors') {
        if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw eventError('Use cores no formato #RRGGBB.');
        result[key][field] = value;
      } else result[key][field] = text(value, `Mensagem ${field}`, 12000);
    }
  }
  if (Boolean(result.startsAt) !== Boolean(result.endsAt)) throw eventError('Preencha as duas datas do evento.');
  if (result.startsAt) {
    const start = Date.parse(result.startsAt), end = Date.parse(result.endsAt);
    if (end <= start) throw eventError('O encerramento deve ser posterior ao início.');
    const count = calendarDates(result);
    if (!Number.isFinite(count) || count < 30 || count > 31) throw eventError('Escolha um período de 30 ou 31 dias do calendário local: as 30 cartas precisam de uma data por dia.');
  }
  if (result.enabled && !result.startsAt) throw eventError('Configure início e encerramento antes de ativar o evento.');
  if (result.meetingDate && result.startsAt && result.meetingDate > localDate(result.startsAt, result.timeZone)) throw eventError('A data do encontro não pode ser posterior ao início do evento.');
  return result;
}

function publicState(config, { now = Date.now(), revision = 0, discoveries = [], canAdmin = false } = {}) {
  const start = config.startsAt && Date.parse(config.startsAt), end = config.endsAt && Date.parse(config.endsAt);
  const configured = config.enabled && start !== null && end !== null;
  const status = !configured ? 'unconfigured' : now < start ? 'upcoming' : now >= end ? 'ended' : 'active';
  const active = status === 'active', memories = status === 'ended' && config.allowMemories;
  const startDate = configured ? localDate(start, config.timeZone) : null;
  const currentDate = localDate(now, config.timeZone);
  const elapsedDay = configured ? ordinal(currentDate) - ordinal(startDate) + 1 : 0;
  const day = status === 'upcoming' || status === 'unconfigured' ? 0 : Math.min(calendarDates(config), Math.max(1, elapsedDay));
  const lastDate = configured ? localDate(end - 1, config.timeZone) : null;
  const finaleAt = lastDate ? Math.max(start, startOfDate(lastDate, config.timeZone)) : null;
  const canRead = (active || memories) && config.features.letters;
  const letters = config.letters.map(letter => {
    const available = startDate ? (letter.day === 1 ? start : startOfDate(addDays(startDate, letter.day - 1), config.timeZone)) : null;
    const unlocked = Boolean(canRead && available < end && now >= available);
    return { day: letter.day, availableAt: available === null ? null : new Date(available).toISOString(), unlocked, ...(unlocked ? { text: letter.text } : {}) };
  });
  const publicConfig = {
    title: config.title, subtitle: config.subtitle, mainText: config.mainText,
    flowers: config.flowers, messages: config.messages, letters,
    features: config.features, colors: config.colors, decorations: config.decorations,
    allowMemories: config.allowMemories,
    ...(config.publishNames ? { names: config.names } : {}),
    ...(config.publishMeetingDate && config.meetingDate ? { meetingDate: config.meetingDate } : {})
  };
  return {
    config: publicConfig, status, active, serverNow: new Date(now).toISOString(), startsAt: config.startsAt, endsAt: config.endsAt,
    timeZone: config.timeZone, day, lettersReleased: letters.filter(letter => letter.unlocked).length,
    daysRemaining: active ? Math.max(1, ordinal(lastDate) - ordinal(currentDate) + 1) : 0,
    finaleAvailable: Boolean(config.features.finale && ((active && now >= finaleAt) || memories)),
    finaleAt: finaleAt === null ? null : new Date(finaleAt).toISOString(),
    discoveries: [...new Set(discoveries)].filter(kind => DISCOVERIES.includes(kind)), canAdmin, revision,
    ...(config.publishMeetingDate && config.meetingDate ? { daysSinceMeeting: Math.max(0, ordinal(currentDate) - ordinal(config.meetingDate)) } : {})
  };
}
function discoveryAllowed(kind, state) {
  if (state.status !== 'active' || !DISCOVERIES.includes(kind)) return false;
  return state.config.features[FLOWER_IDS.includes(kind) ? 'garden' : kind] === true;
}
function bootstrap(state) {
  return { status: state.status, active: state.active, serverNow: state.serverNow, endsAt: state.endsAt, title: state.config.title, colors: state.config.colors, features: { intro: state.config.features.intro, decorations: state.config.features.decorations }, decorations: state.config.decorations };
}
module.exports = { defaults, normalizeConfig, publicState, discoveryAllowed, bootstrap, eventError, FLOWER_IDS, DISCOVERIES, localDate, startOfDate, calendarDates };
