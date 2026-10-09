// Seleção explícita, histórico disponível e monitoramento em tempo real.
export function bindLive({ onMessages, notify, onOffline }) {
  const $ = id => document.getElementById(id);
  const api = window.desktop?.whatsapp;
  const selected = new Set();
  const all = new Map();
  const collection = new Map();
  const coverage = new Map();
  let phase = 'offline';
  let syncing = false;
  let displayed = 0;
  let renderTimer;
  const nf = new Intl.NumberFormat('pt-BR');
  const MAX_RENDER = 160;
  function state(label, kind) {
    $('wa-state').textContent = label;
    $('wa-state').dataset.kind = kind;
    $('wa-connect').disabled = ['ready','starting','qr','authenticating','repairing'].includes(kind);
    $('wa-refresh').disabled = kind !== 'ready' || syncing;
    $('wa-sync').disabled = kind !== 'ready' || selected.size === 0 || syncing;
    $('wa-pause').disabled = ['offline','repairing'].includes(kind) || syncing;
    $('wa-repair').hidden = kind !== 'error';
    $('wa-cancel').hidden = !syncing;
    $('wa-select-all').disabled = kind !== 'ready' || syncing;
    $('wa-history-limit').disabled = kind !== 'ready' || syncing;
  }
  function updateCount() {
    $('wa-count').textContent = `${nf.format(selected.size)} de ${nf.format(all.size)} selecionadas`;
    $('wa-sync').disabled = phase !== 'ready' || selected.size === 0 || syncing;
  }
  function drawChats(reset = true) {
    if (reset) displayed = 0;
    const root = $('wa-chats');
    if (reset) root.replaceChildren();
    const q = $('wa-chat-search').value.trim().toLocaleLowerCase('pt-BR');
    const matched = [...all.values()].filter(c => c.name.toLocaleLowerCase('pt-BR').includes(q));
    const page = matched.slice(displayed, displayed + MAX_RENDER);
    const more = root.querySelector('.wa-more');
    if (more) more.remove();
    for (const chat of page) {
      const label = document.createElement('label'); label.className = 'wa-chat';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(chat.id); checkbox.disabled = syncing;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(chat.id); else selected.delete(chat.id);
        updateCount();
      });
      const name = document.createElement('span'); name.textContent = chat.name;
      const type = document.createElement('small'); type.textContent = chat.isGroup ? 'GRUPO' : 'CHAT';
      label.append(checkbox, name, type); root.append(label);
    }
    displayed += page.length;
    if (displayed < matched.length) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'wa-more';
      btn.textContent = `Mostrar mais (${nf.format(displayed)} de ${nf.format(matched.length)})`;
      btn.addEventListener('click', () => drawChats(false)); root.append(btn);
    }
    if (!matched.length) {
      const empty = document.createElement('p');
      empty.textContent = all.size ? 'Nenhuma conversa encontrada.' : 'As conversas aparecerão depois da conexão.';
      root.append(empty);
    }
    updateCount();
  }
  function drawCoverage() {
    const host = $('wa-coverage'); host.replaceChildren();
    for (const item of coverage.values()) {
      const row = document.createElement('div'); row.className = 'wa-coverage-row';
      const name = document.createElement('strong'); name.textContent = item.name;
      const summary = document.createElement('span');
      const start = item.first ? new Date(item.first).toLocaleDateString('pt-BR') : '—';
      const end = item.last ? new Date(item.last).toLocaleDateString('pt-BR') : '—';
      summary.textContent = `${nf.format(item.received)} mensagens · ${start} a ${end}${item.mayHaveMore ? ' · pode haver mais histórico' : ''}`;
      row.append(name, summary); host.append(row);
    }
  }
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => onMessages([...collection.values()]), 280);
  }
  function ingest(items) {
    for (const item of items) {
      if (!item.id || !Number.isFinite(Date.parse(item.date))) continue;
      collection.set(item.id, { id:item.id, chatId:item.chatId, source:item.source, author:item.author, date:new Date(item.date), text:item.text, media:item.media });
    }
    $('wa-loaded').textContent = nf.format(collection.size);
    scheduleRender();
  }
  async function refresh() {
    try {
      const chats = await api.chats();
      all.clear(); for (const chat of chats) all.set(chat.id, chat);
      for (const id of [...selected]) if (!all.has(id)) selected.delete(id);
      drawChats();
      notify(`${nf.format(chats.length)} conversas encontradas no WhatsApp Web.`);
    } catch(e) { notify(`Não foi possível carregar conversas: ${e.message}`, true); }
  }
  async function connect() {
    try { await api.connect(); } catch(e) { notify(`Falha ao iniciar: ${e.message}`, true); state('Erro ao iniciar', 'error'); }
  }
  async function repair() {
    if (!confirm('Reparar conexão? O programa encerrará somente processos Chrome/Edge que estiverem usando o perfil exclusivo do WhatsApp Analytics. A sessão do WhatsApp será preservada.')) return;
    try {
      const r = await api.repair();
      notify(`Reparo concluído (${r.closed} processo(s) encerrado(s)). Clique em Conectar WhatsApp.`);
    } catch(e) { notify(`Reparo não concluído: ${e.message}`, true); }
  }
  function selectAll() {
    const q = $('wa-chat-search').value.trim().toLocaleLowerCase('pt-BR');
    const matched = [...all.values()].filter(c => c.name.toLocaleLowerCase('pt-BR').includes(q));
    const shouldSelect = matched.some(c => !selected.has(c.id));
    for (const chat of matched) { if (shouldSelect) selected.add(chat.id); else selected.delete(chat.id); }
    drawChats();
    notify(shouldSelect ? `${nf.format(matched.length)} conversas selecionadas.` : 'Seleção removida.');
  }
  async function sync() {
    if (!selected.size || syncing) return;
    const limit = $('wa-history-limit').value;
    if (limit === 'all' && !confirm(`Carregar todo o histórico DISPONÍVEL no WhatsApp Web de ${nf.format(selected.size)} conversa(s)? Pode demorar bastante, usar muita memória e não inclui mensagens inacessíveis no WhatsApp Web.`)) return;
    syncing = true;
    coverage.clear(); drawCoverage();
    collection.clear(); $('wa-loaded').textContent = '0';
    $('wa-progress').textContent = 'Preparando sincronização…';
    state('Sincronizando…', phase);
    drawChats();
    try {
      const result = await api.sync([...selected], { limit });
      clearTimeout(renderTimer); onMessages([...collection.values()]);
      $('wa-progress').textContent = `${nf.format(result.count)} mensagens carregadas · ${result.completed}/${result.monitored} conversas · ${result.cancelled ? 'interrompido' : 'finalizado'}`;
      notify(result.failed.length ? `${result.failed.length} conversa(s) falharam. Veja a cobertura; tente novamente.` : 'Sincronização concluída com dados reais disponíveis.', Boolean(result.failed.length));
      if (result.failed.length) {
        const names = result.failed.map(f => `${f.name}: ${f.error}`).join(' | ');
        $('wa-progress').textContent += ` · Erros: ${names.slice(0, 450)}`;
      }
    } catch(e) { notify(`Falha ao sincronizar: ${e.message}`, true); }
    finally { syncing = false; state(phase === 'ready' ? 'Conectado' : 'Desconectado', phase); drawChats(); }
  }
  async function stop() {
    try { await api.stop(false); notify('Conexão pausada, sessão preservada.'); onOffline(); }
    catch(e) { notify(`Falha ao pausar: ${e.message}`, true); }
  }
  if (!api) { state('Disponível apenas no Windows', 'offline'); $('wa-connect').disabled = true; return; }
  api.on('wa:state', async payload => {
    phase = payload.phase;
    const labels = { offline:'Desconectado', starting:'Iniciando…', qr:'Aguardando QR', authenticating:'Autenticando…', ready:'Conectado', error:'Erro de conexão', repairing:'Reparando…' };
    state(labels[phase] || phase, phase);
    $('wa-progress').textContent = payload.detail || '';
    if (phase === 'ready') { $('wa-qr-wrap').hidden = true; await refresh(); }
    if (phase === 'offline') { $('wa-qr-wrap').hidden = true; all.clear(); selected.clear(); drawChats(); }
  });
  api.on('wa:qr', ({dataUrl}) => { $('wa-qr-wrap').hidden = !dataUrl; if (dataUrl) $('wa-qr').src = dataUrl; });
  api.on('wa:error', ({message}) => notify(message, true));
  api.on('wa:batch', ({messages}) => ingest(messages));
  api.on('wa:message', msg => ingest([msg]));
  api.on('wa:coverage', entry => { coverage.set(entry.chatId, entry); drawCoverage(); });
  api.on('wa:progress', p => { $('wa-progress').textContent = `${p.current}/${p.total} conversas · ${nf.format(p.count)} mensagens · ${p.name}${p.loading ? ' (carregando)' : ''}`; });
  $('wa-connect').addEventListener('click', connect);
  $('wa-refresh').addEventListener('click', refresh);
  $('wa-sync').addEventListener('click', sync);
  $('wa-repair').addEventListener('click', repair);
  $('wa-select-all').addEventListener('click', selectAll);
  $('wa-cancel').addEventListener('click', async () => { await api.cancelSync(); notify('Cancelamento solicitado. O chat atual pode demorar até terminar de carregar.'); });
  $('wa-pause').addEventListener('click', stop);
  $('wa-chat-search').addEventListener('input', () => drawChats());
  api.status().then(s => { phase = s.phase; state(s.phase === 'ready' ? 'Conectado' : 'Desconectado', s.phase); }).catch(() => {});
  drawChats();
}