/** Supports common Android and iOS WhatsApp export headers in pt-BR/en-US. */
const ANDROID = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*[-–]\s*(.*)$/u;
const IOS = /^\[(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\]\s*(.*)$/u;
const SYSTEM = /^(?:mensagens e ligações|messages and calls|você criou|you created|alterou o assunto|changed the subject|adicionou |added |saiu|left|entrou usando|joined using|agora é administrador|is now an admin|código de segurança|security code|este grupo foi criado|this group was created|fixou uma mensagem|pinned a message|apagou esta mensagem|deleted this message)/i;
const MEDIA = /(?:<mídia oculta>|<media omitted>|imagem ocultada|vídeo omitido|áudio oculto|figurinha omitida|documento omitido|image omitted|video omitted|audio omitted|sticker omitted|document omitted|\.\s*\(arquivo anexado\)|\.\s*\(file attached\))/i;

export function parseWhatsApp(text, { dayFirst = true, source = 'Conversa' } = {}) {
  if (typeof text !== 'string') throw new TypeError('Exportação deve ser texto.');
  const messages = [];
  const lines = text.replace(/^\uFEFF/, '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').split(/\r?\n/);
  let current = null;
  let ignored = 0;
  const flush = () => {
    if (!current) return;
    if (current.author) {
      current.text = current.text.trim();
      current.media = MEDIA.test(current.text);
      messages.push(current);
    } else ignored++;
  };
  for (const line of lines) {
    const match = line.match(ANDROID) || line.match(IOS);
    if (match) {
      const [, a, b, yearRaw, hourRaw, minuteRaw, secondRaw, ap, body] = match;
      const day = Number(dayFirst ? a : b), month = Number(dayFirst ? b : a);
      const year = Number(yearRaw.length === 2 ? (Number(yearRaw) >= 70 ? '19' : '20') + yearRaw : yearRaw);
      let hour = Number(hourRaw);
      if (ap) { hour = hour % 12 + (ap.toLowerCase() === 'pm' ? 12 : 0); }
      const minute = Number(minuteRaw), second = Number(secondRaw || 0);
      const date = new Date(year, month - 1, day, hour, minute, second);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || hour > 23 || minute > 59 || second > 59) {
        if (current) current.text += '\n' + line;
        continue;
      }
      flush();
      const split = body.indexOf(': ');
      const author = split >= 0 ? body.slice(0, split).trim() : '';
      current = { date, author: author && !SYSTEM.test(body) ? author : '', text: split >= 0 ? body.slice(split + 2) : body, source };
    } else if (current) current.text += '\n' + line;
  }
  flush();
  return { messages, ignored, lines: lines.length, source };
}