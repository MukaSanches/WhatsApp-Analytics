'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { isBrowserProfileConflict, repairStaleSession } = require('./session-recovery.cjs');
const { readCompatibleChats, readCompatibleMessages } = require('./wa-compat.cjs');

function browserExecutable() {
  if (process.env.WA_BROWSER_PATH && fs.existsSync(process.env.WA_BROWSER_PATH)) return process.env.WA_BROWSER_PATH;
  const vars = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = vars.flatMap(base => [
    path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(base, 'Chromium', 'Application', 'chrome.exe')
  ]);
  return candidates.find(x => fs.existsSync(x)) || null;
}

class WhatsAppBridge {
  constructor({ sessionPath, emit }) {
    this.sessionPath = sessionPath;
    this.emit = emit;
    this.client = null;
    this.phase = 'offline';
    this.monitored = new Map();
    this.syncing = false;
    this.launchPromise = null;
    this.cancelRequested = false;
  }
  setState(phase, detail = '') {
    this.phase = phase;
    this.emit('wa:state', { phase, detail });
  }
  getStatus() { return { phase: this.phase, monitoring: this.monitored.size }; }
  async start() {
    if (this.client) return this.getStatus();
    const executablePath = browserExecutable();
    if (!executablePath) throw new Error('Instale Microsoft Edge ou Google Chrome para conectar ao WhatsApp Web.');
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: 'analytics', dataPath: this.sessionPath }),
      puppeteer: { executablePath, headless: true, args: ['--disable-extensions', '--no-first-run'] },
      qrMaxRetries: 12,
      authTimeoutMs: 120000
    });
    this.client = client;
    this.setState('starting', 'Iniciando conexão segura no navegador local…');
    client.on('qr', async raw => {
      if (client !== this.client) return;
      try {
        const dataUrl = await QRCode.toDataURL(raw, { margin: 2, width: 290, color: { dark: '#0c3628', light: '#ffffffff' } });
        if (this.client !== client) return;
        this.setState('qr', 'Abra WhatsApp → Aparelhos conectados → Conectar aparelho.');
        this.emit('wa:qr', { dataUrl });
      } catch (e) { this.emit('wa:error', { message: 'Erro ao gerar o QR Code: ' + e.message }); }
    });
    client.on('authenticated', () => { if (this.client === client) this.setState('authenticating', 'Autenticado. Sincronizando com o WhatsApp…'); });
    client.on('ready', () => {
      if (this.client !== client) return;
      this.setState('ready', 'Conectado. Escolha as conversas para analisar.');
      this.emit('wa:qr', { dataUrl: null });
    });
    client.on('auth_failure', message => { if (this.client === client) this.setState('error', 'Falha de autenticação: ' + String(message).slice(0, 180)); });
    client.on('disconnected', reason => {
      if (this.client !== client) return;
      this.client = null;
      this.monitored.clear();
      this.setState('offline', 'Conexão encerrada: ' + String(reason).slice(0, 100));
    });
    client.on('message_create', message => {
      if (client !== this.client || this.phase !== 'ready') return;
      if (!Number.isFinite(Number(message.timestamp))) return;
      const id = message.fromMe ? message.to : message.from;
      const source = this.monitored.get(id);
      if (!source) return;
      this.emit('wa:message', this.normalize(message, id, source));
    });
    this.launchPromise = client.initialize().catch(async err => {
      if (this.client === client) {
        this.client = null;
        try { await client.destroy(); } catch { /* o navegador pode não ter inicializado */ }
        const detail = String(err.message || err);
        if (isBrowserProfileConflict(detail)) {
          this.setState('error', 'A sessão do navegador já está em uso. Clique em Reparar conexão; o WhatsApp não será desvinculado.');
        } else {
          this.setState('error', 'Não foi possível conectar: ' + detail.slice(0, 300));
        }
      }
    }).finally(() => { this.launchPromise = null; });
    return this.getStatus();
  }
  assertReady() {
    if (!this.client || this.phase !== 'ready') throw new Error('Conecte o WhatsApp primeiro.');
  }
  async listChats() {
    this.assertReady();
    try {
      // WhatsApp Web can hang during model serialization; never block the
      // compatibility reader indefinitely waiting for its public API.
      let timer;
      const chats = await Promise.race([
        this.client.getChats(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo excedido em getChats')), 15000); })
      ]).finally(() => clearTimeout(timer));
      const mapped = chats.filter(c => c.id?._serialized && !c.isStatus && !c.id._serialized.endsWith('@newsletter'))
        .map(c => ({
          id: c.id._serialized, name: String(c.name || c.id._serialized.split('@')[0]).slice(0, 120),
          isGroup: Boolean(c.isGroup || c.id._serialized.endsWith('@g.us')),
          unread: Number(c.unreadCount || 0)
        }));
      // The public API may silently return [] when its injected models break.
      if (mapped.length) return mapped;
      const fallback = await readCompatibleChats(this.client);
      if (fallback.length) this.emit('wa:notice', { message: `Modo compatibilidade ativo: ${fallback.length} conversas carregadas.` });
      return fallback;
    } catch (standardError) {
      try {
        const fallback = await readCompatibleChats(this.client);
        this.emit('wa:notice', { message: `Leitura alternativa ativada: ${fallback.length} conversas. A biblioteca original falhou (${String(standardError.message || standardError).slice(0, 80)}).` });
        return fallback;
      } catch (compatError) {
        throw new Error(`Falha ao listar conversas. API padrão: ${String(standardError.message || standardError).slice(0, 100)}. Leitor alternativo: ${String(compatError.message || compatError).slice(0, 160)}`);
      }
    }
  }
  normalize(message, chatId, source) {
    const rawId = message.id?._serialized || message.id?.$1 || (typeof message.id === 'string' ? message.id : null) || `${chatId}-${message.timestamp}-${message.fromMe}`;
    const author = message.fromMe ? 'Você' : (message.author ? String(message.author).split('@')[0] : source);
    return {
      id: String(rawId), chatId, source, author,
      date: new Date(Number(message.timestamp) * 1000).toISOString(),
      text: typeof message.body === 'string' ? message.body.slice(0, 12000) : '',
      media: Boolean(message.hasMedia || message.type && !['chat', 'revoked'].includes(message.type))
    };
  }
  async sync(ids, options = {}) {
    this.assertReady();
    if (this.syncing) throw new Error('Já existe uma sincronização em andamento.');
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || id.length > 180)) {
      throw new Error('Selecione pelo menos uma conversa válida.');
    }
    const limit = options.limit === 'all' ? Infinity : Number(options.limit ?? 400);
    if (![400, 2000, Infinity].includes(limit)) throw new Error('Escolha um limite de histórico válido.');
    const uniqueIds = [...new Set(ids)];
    const available = await this.listChats();
    const lookup = new Map(available.map(c => [c.id, c]));
    if (uniqueIds.some(id => !lookup.has(id))) throw new Error('Conversa inválida. Atualize a lista.');
    this.monitored = new Map(uniqueIds.map(id => [id, lookup.get(id).name]));
    this.syncing = true;
    this.cancelRequested = false;
    try {
      let count = 0;
      const failed = [];
      const coverage = [];
      let completed = 0;
      for (let index = 0; index < uniqueIds.length; index++) {
        if (this.cancelRequested) break;
        if (this.phase !== 'ready') throw new Error('A conexão foi interrompida.');
        const id = uniqueIds[index];
        const name = this.monitored.get(id);
        try {
          let valid;
          let partialReason = '';
          let compatibility = false;
          // In recent WhatsApp Web builds getChatById() and its model serialization
          // can fail with a minified "r" error even though authentication succeeded.
          try {
            // Safe-mode all-history requests are capped to avoid unlimited memory/CPU.
            if (limit === Infinity) throw new Error('Usar modo compatibilidade para histórico profundo.');
            const chat = await this.client.getChatById(id);
            const items = await chat.fetchMessages({ limit });
            valid = items.filter(m => Number.isFinite(Number(m.timestamp)) && Number(m.timestamp) > 0);
          } catch (standardError) {
            try {
              const fallback = await readCompatibleMessages(this.client, id, limit === Infinity ? 'all' : limit);
              valid = fallback.messages;
              compatibility = true;
              partialReason = fallback.partialReason || '';
              if (fallback.incomplete) this.emit('wa:notice', { message: `${name}: histórico parcial. ${partialReason}` });
            } catch (compatError) {
              throw new Error(`API padrão: ${String(standardError.message || standardError).slice(0, 90)}; compatibilidade: ${String(compatError.message || compatError).slice(0, 120)}`);
            }
          }
          for (let offset = 0; offset < valid.length; offset += 250) {
            if (this.cancelRequested) break;
            const messages = valid.slice(offset, offset + 250).map(m => this.normalize(m, id, name));
            this.emit('wa:batch', { chatId: id, name, messages });
            count += messages.length;
            this.emit('wa:progress', { current: index + 1, total: uniqueIds.length, count, name, loading: true });
            await new Promise(resolve => setImmediate(resolve));
          }
          const timestamps = valid.map(m => Number(m.timestamp)).sort((a, b) => a - b);
          const entry = {
            chatId: id, name, received: valid.length,
            first: timestamps.length ? new Date(timestamps[0] * 1000).toISOString() : null,
            last: timestamps.length ? new Date(timestamps.at(-1) * 1000).toISOString() : null,
            mayHaveMore: Boolean(partialReason) || (Number.isFinite(limit) && valid.length >= limit),
            compatibility, partialReason,
            cancelled: this.cancelRequested
          };
          coverage.push(entry);
          this.emit('wa:coverage', entry);
        } catch (e) {
          failed.push({ name, error: String(e.message || e).slice(0, 200) });
        }
        completed++;
        this.emit('wa:progress', { current: completed, total: uniqueIds.length, count, name, loading: false });
      }
      return { count, monitored: uniqueIds.length, completed, cancelled: this.cancelRequested, failed, coverage };
    } finally {
      this.syncing = false;
      this.cancelRequested = false;
    }
  }
  cancelSync() {
    if (!this.syncing) return { cancelled: false };
    this.cancelRequested = true;
    return { cancelled: true };
  }
  async repair() {
    if (this.client || this.launchPromise || this.syncing) throw new Error('Pause a conexão antes de reparar a sessão.');
    this.setState('repairing', 'Verificando processos antigos do navegador do aplicativo…');
    try {
      const closed = await repairStaleSession(this.sessionPath);
      this.setState('offline', `${closed} processo(s) do navegador do aplicativo encerrado(s). Sua autenticação foi preservada. Clique em Conectar WhatsApp.`);
      return { closed };
    } catch (e) {
      this.setState('error', `Falha no reparo: ${String(e.message || e).slice(0, 220)}`);
      throw e;
    }
  }
  async shutdown() {
    this.cancelRequested = true;
    const client = this.client;
    this.client = null;
    this.monitored.clear();
    if (client) { try { await client.destroy(); } catch { /* sessão preservada */ } }
    this.setState('offline', 'Aplicativo encerrado; sessão preservada.');
  }
  async stop(logout = false) {
    if (this.syncing) throw new Error('Aguarde a sincronização terminar.');
    const client = this.client;
    this.client = null;
    this.monitored.clear();
    if (client) {
      try {
        if (logout) await client.logout();
        else await client.destroy();
      } catch (e) { this.emit('wa:error', { message: String(e.message || e) }); }
    }
    this.setState('offline', logout ? 'Sessão desconectada.' : 'Conexão pausada; sessão preservada neste computador.');
    return this.getStatus();
  }
}
module.exports = { WhatsAppBridge, browserExecutable };