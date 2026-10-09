export const STOPWORDS = new Set(`a o as os um uma uns umas de da do das dos e é em no na nos nas que para por com sem ao aos à às eu tu ele ela nós vocês eles elas meu minha seu sua isso esse essa aquele aquela aqui aí lá já mas ou se não sim foi era são ser ter tem tá tô estou você vc vcs pq porque pra pro bem muito mais menos até entre pelo pela pelos pelas cada todo toda todos todas quando onde quem qual quais hoje ontem amanhã agora depois antes ainda então também mesmo mesmo só tipo gente coisa coisas fala falou disse fazer faz feito vou vai vamos tava estava estão kkk kkkkk kkkkkk haha rs rsrs bom boa oi olá neh né ah oh hmm ué ok blz ta te me mim ti lhe deles delas nosso nossa vocês boa noite bom dia boa tarde obrigado obrigada meu deus mano cara aqui isso aquilo assim bjs beijo abraços certo claro nada tudo qualquer iria sou fui estar né neh eita viu hahaha`.split(/\s+/));
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
const LINK = /https?:\/\/\S+/gi;
const MEDIA = /(?:<mídia oculta>|<media omitted>|imagem ocultada|vídeo omitido|áudio oculto|figurinha omitida|documento omitido|image omitted|video omitted|audio omitted|sticker omitted|document omitted|\(arquivo anexado\)|\(file attached\))/i;
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = date => dayKey(date).slice(0, 7);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x-y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };

export function analyze(messages, { query = '', from = '', to = '', source = 'all' } = {}) {
  const q = query.toLocaleLowerCase('pt-BR');
  const filtered = messages.filter(m => {
    const day = dayKey(m.date);
    return (!from || day >= from) && (!to || day <= to) && (source === 'all' || m.source === source) && (!q || m.author.toLocaleLowerCase('pt-BR').includes(q) || m.text.toLocaleLowerCase('pt-BR').includes(q));
  }).sort((a, b) => a.date - b.date);
  const byAuthor = new Map(), days = new Map(), months = new Map(), hours = Array(24).fill(0), week = Array(7).fill(0), heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const wordCounts = new Map(), emojis = new Map();
  let media = 0, textTotal = 0, links = 0, responseTimes = [];
  let last = null;
  for (const m of filtered) {
    const sender = m.author || 'Desconhecido';
    byAuthor.set(sender, (byAuthor.get(sender) || 0) + 1);
    const day = dayKey(m.date), month = monthKey(m.date), hour = m.date.getHours(), dow = (m.date.getDay() + 6) % 7;
    days.set(day, (days.get(day) || 0) + 1);
    months.set(month, (months.get(month) || 0) + 1);
    hours[hour]++; week[dow]++; heat[dow][hour]++;
    if (m.media || MEDIA.test(m.text)) media++;
    if (/https?:\/\//i.test(m.text)) links++;
    textTotal += m.text.length;
    for (const emoji of m.text.match(EMOJI) || []) emojis.set(emoji, (emojis.get(emoji) || 0) + 1);
    if (!(m.media || MEDIA.test(m.text))) {
      for (const token of m.text.replace(LINK, ' ').toLocaleLowerCase('pt-BR').match(/\p{L}{3,}/gu) || []) {
        if (!STOPWORDS.has(token)) wordCounts.set(token, (wordCounts.get(token) || 0) + 1);
      }
    }
    if (last && last.author !== sender && last.source === m.source) {
      const diff = (m.date - last.date) / 60000;
      if (diff >= 0 && diff <= 1440) responseTimes.push(diff);
    }
    last = m;
  }
  const sorted = map => [...map.entries()].sort((a, b) => b[1] - a[1]);
  const daily = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
  const topHour = hours.indexOf(Math.max(...hours));
  return {
    total: filtered.length, participants: byAuthor.size, activeDays: days.size,
    avgDay: days.size ? filtered.length / days.size : 0,
    media, links, characters: textTotal, responseMedianMin: median(responseTimes),
    topHour: filtered.length ? topHour : null,
    first: filtered[0]?.date || null, last: filtered.at(-1)?.date || null,
    participantsRank: sorted(byAuthor), words: sorted(wordCounts).slice(0, 60), emojis: sorted(emojis).slice(0, 20),
    daily, monthly, hours, week, heat, filtered
  };
}

export function demoMessages() {
  const people = ['Ana', 'Bruno', 'Carla', 'Você'];
  const phrases = [
    'Bom dia! Como estão vocês? ☀️', 'Vamos marcar um café no sábado? ☕', 'Adorei a ideia! 😂',
    'O projeto está ficando incrível 🚀', 'Você viu as novidades de hoje?',
    'Mandei as fotos da viagem 📷', 'Depois combinamos os detalhes',
    'Isso ficou excelente! 💚', 'Alguém consegue ajudar amanhã?',
    'Já enviei o arquivo, obrigado!', 'A reunião foi ótima hoje!',
    'Vamos organizar tudo para sexta-feira', 'Perfeito, combinado! 🙌',
    'Vou conferir e te retorno mais tarde', 'Que notícia boa! 🎉'
  ];
  let seed = 76543;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const data = [];
  for (let i = 0; i < 1480; i++) {
    const daysBack = Math.floor(random() * 170);
    const hour = Math.floor(7 + random() * 17);
    const date = new Date(2026, 9, 8 - daysBack, hour, Math.floor(random() * 60));
    const author = people[Math.floor(random() * people.length)];
    const text = random() < .09 ? '<mídia oculta>' : phrases[Math.floor(random() * phrases.length)];
    data.push({ date, author, text, source: 'Grupo de demonstração', media: text.includes('mídia oculta') });
  }
  return data.sort((a, b) => a.date - b.date);
}