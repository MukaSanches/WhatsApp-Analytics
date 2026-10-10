'use strict';

// Minimal read-only WhatsApp Web compatibility layer. This code runs inside
// Puppeteer's WhatsApp Web page via page.evaluate, not in the Electron renderer.
// Avoid calling chat.serialize() or WWebJS.getChatModel(), which break when
// WhatsApp Web changes internal chat ID fields (_serialized vs $1).
function readChatListInPage() {
  const collections = window.require?.('WAWebCollections');
  if (!collections?.Chat?.getModelsArray) throw new Error('WAWebCollections.Chat indisponível. Aguarde sincronizar o WhatsApp Web.');
  const idOf = (value) => {
    if (typeof value === 'string') return value;
    return typeof value?._serialized === 'string' ? value._serialized
      : typeof value?.$1 === 'string' ? value.$1
        : typeof value?.user === 'string' && typeof value?.server === 'string' ? `${value.user}@${value.server}` : '';
  };
  const output = [];
  for (const chat of collections.Chat.getModelsArray()) {
    try {
      const id = idOf(chat?.id);
      if (!id || id.endsWith('@newsletter') || id === 'status@broadcast') continue;
      const title = [chat.name, chat.formattedTitle, chat.contact?.name, chat.contact?.pushname, chat.contact?.formattedName]
        .find(x => typeof x === 'string' && x.trim());
      output.push({
        id,
        name: String(title || id.split('@')[0]).slice(0, 120),
        isGroup: id.endsWith('@g.us'),
        unread: Number.isFinite(Number(chat.unreadCount)) ? Math.max(0, Number(chat.unreadCount)) : 0
      });
    } catch { /* A damaged chat model must not hide all other chats. */ }
  }
  return output;
}

// Fallback to cached raw message models and optional history loading.
// Returns primitives only (never serializes whole chat/message models).
async function readMessagesInPage(chatId, requestedLimit) {
  const collections = window.require?.('WAWebCollections');
  if (!collections?.Chat?.getModelsArray) throw new Error('Coleção de conversas não disponível.');
  const idOf = (value) => {
    if (typeof value === 'string') return value;
    return typeof value?._serialized === 'string' ? value._serialized
      : typeof value?.$1 === 'string' ? value.$1
        : typeof value?.user === 'string' && typeof value?.server === 'string' ? `${value.user}@${value.server}` : '';
  };
  const chat = collections.Chat.getModelsArray().find(x => idOf(x?.id) === chatId);
  if (!chat) throw new Error('Conversa ainda não está no cache do WhatsApp Web. Abra o chat no celular e tente Atualizar.');
  if (!chat.msgs?.getModelsArray) throw new Error('Mensagens desta conversa não foram disponibilizadas pelo WhatsApp Web.');
  const maxAllowed = requestedLimit === 'all' ? 20000 : Number(requestedLimit);
  if (![400, 2000, 20000].includes(maxAllowed)) throw new Error('Limite de leitura inválido.');
  const seen = new Map();
  function absorb(items) {
    for (const m of items || []) {
      try {
        if (!m || m.isNotification) continue;
        const ts = Number(m.t ?? m.timestamp);
        if (!Number.isFinite(ts) || ts <= 0) continue;
        const authorId = idOf(m.author || m.id?.participant || m.from);
        const fromMe = Boolean(m.id?.fromMe ?? m.fromMe);
        const messageId = idOf(m.id) || `${chatId}-${ts}-${fromMe}-${authorId}-${String(m.body || '').slice(0, 24)}`;
        const body = typeof m.body === 'string' ? m.body : typeof m.caption === 'string' ? m.caption : '';
        const msgType = typeof m.type === 'string' ? m.type : 'chat';
        seen.set(messageId, {
          id: messageId, timestamp: ts, fromMe, author: authorId,
          body: body.slice(0, 12000),
          hasMedia: Boolean(m.isMedia || m.hasMedia || (msgType !== 'chat' && msgType !== 'revoked')),
          type: msgType
        });
      } catch { /* Skip individual incompatible messages. */ }
    }
  }
  absorb(chat.msgs.getModelsArray());
  let rounds = 0;
  let incomplete = false;
  let partialReason = '';
  let noProgress = 0;
  while (seen.size < maxAllowed && rounds < 120) {
    rounds++;
    let loaded;
    try {
      const loader = window.require?.('WAWebChatLoadMessages')?.loadEarlierMsgs;
      if (typeof loader !== 'function') { incomplete = true; partialReason = 'O carregamento de mensagens antigas não está disponível nesta versão do WhatsApp Web.'; break; }
      loaded = await loader({chat});
    } catch (error) {
      incomplete = true;
      partialReason = `O WhatsApp Web não liberou mais histórico (${String(error?.message || error).slice(0, 100)}).`;
      break;
    }
    if (!Array.isArray(loaded) || !loaded.length) break;
    const before = seen.size;
    absorb(loaded);
    // Cached collection may now contain additional older messages.
    absorb(chat.msgs.getModelsArray());
    noProgress = before === seen.size ? noProgress + 1 : 0;
    if (noProgress >= 2) { incomplete = true; partialReason = 'Sem progresso na paginação do histórico.'; break; }
  }
  if (rounds >= 120 && seen.size < maxAllowed) { incomplete = true; partialReason = 'Limite seguro de paginação atingido.'; }
  if (requestedLimit === 'all' && seen.size >= maxAllowed) {
    incomplete = true; partialReason = 'Limite de segurança de 20 mil mensagens por conversa atingido no modo compatibilidade.';
  }
  const messages = [...seen.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-maxAllowed);
  return { messages, incomplete, partialReason, compatibility: true };
}

async function readCompatibleChats(client) {
  if (!client?.pupPage?.evaluate) throw new Error('Navegador do WhatsApp não está pronto.');
  return client.pupPage.evaluate(readChatListInPage);
}
async function readCompatibleMessages(client, chatId, limit) {
  if (!client?.pupPage?.evaluate) throw new Error('Navegador do WhatsApp não está pronto.');
  return client.pupPage.evaluate(readMessagesInPage, chatId, limit);
}
module.exports = { readChatListInPage, readMessagesInPage, readCompatibleChats, readCompatibleMessages };