// Gerencia apenas os dados das conversas que o usuário selecionou explicitamente.
export function bindLive({ onMessages, notify, onOffline }) {
  const $ = id => document.getElementById(id);
  const api = window.desktop?.whatsapp;
  const selected = new Set();
  const all = new Map();
  const collection = new Map();
  let phase = 'offline';
  function state(label, kind) {
    $('wa-state').textContent = label;
    $('wa-state').dataset.kind = kind;
    $('wa-connect').disabled = kind === 'ready' || kind === 'starting' || kind === 'qr';
    $('wa-refresh').disabled = kind !== 'ready';
    $('wa-sync').disabled = kind !== 'ready' || selected.size === 0;
    $('wa-pause').disabled = kind === 'offline';
  }
  function drawChats() {
    const root = $('wa-chats');root.replaceChildren();
    const q = $('wa-chat-search').value.trim().toLocaleLowerCase('pt-BR');
    const matched = [...all.values()].filter(c => c.name.toLocaleLowerCase('pt-BR').includes(q));
    matched.slice(0, 100).forEach(chat => {
      const label = document.createElement('label');label.className = 'wa-chat';
      const checkbox = document.createElement('input');checkbox.type = 'checkbox';checkbox.checked = selected.has(chat.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 15) {checkbox.checked = false;notify('Limite de 15 conversas por sincronização.',true);return;}
        if (checkbox.checked) selected.add(chat.id);else selected.delete(chat.id);
        $('wa-count').textContent = `${selected.size} selecionadas`;
        $('wa-sync').disabled = phase !== 'ready' || selected.size === 0;
      });
      const name = document.createElement('span');name.textContent = chat.name;
      const type = document.createElement('small');type.textContent = chat.isGroup ? 'GRUPO' : 'CHAT';
      label.append(checkbox,name,type);root.append(label);
    });
    if (!matched.length) {const empty=document.createElement('p');empty.textContent = all.size ? 'Nenhuma conversa encontrada.' : 'A lista aparecerá após conectar.';root.append(empty);}
  }
  function ingest(items, reset = false) {
    if (reset) collection.clear();
    for (const item of items) {
      if (!item.id || !Number.isFinite(Date.parse(item.date))) continue;
      collection.set(item.id, { id:item.id, chatId:item.chatId, source:item.source, author:item.author, date:new Date(item.date), text:item.text, media:item.media });
    }
    // Limite de memória para proteger computadores modestos.
    if (collection.size > 15000) {
      const byDate = [...collection.values()].sort((a,b)=>b.date-a.date).slice(0,15000);
      collection.clear();for(const item of byDate)collection.set(item.id,item);
    }
    onMessages([...collection.values()]);
  }
  async function refresh() {
    try {
      const chats = await api.chats();
      all.clear();for (const chat of chats) all.set(chat.id,chat);
      for (const id of [...selected]) if(!all.has(id))selected.delete(id);
      drawChats();
      $('wa-count').textContent = `${selected.size} selecionadas`;
      notify(`${chats.length} conversas disponíveis.`);
    } catch(e) {notify(`Não foi possível carregar conversas: ${e.message}`,true);}
  }
  async function connect() {
    try { await api.connect(); } catch(e){notify(`Falha ao iniciar conexão: ${e.message}`,true);state('Erro ao iniciar','error');}
  }
  async function sync() {
    if (!selected.size) return;
    $('wa-sync').disabled = true;
    $('wa-progress').textContent = 'Iniciando sincronização…';
    collection.clear(); // Não misturar resultados antigos com a nova seleção.
    try {
      const result = await api.sync([...selected]);
      ingest([]);
      $('wa-progress').textContent = `${result.count} mensagens recebidas · ${result.monitored} conversas monitoradas`;
      notify(result.failed.length ? `Algumas conversas não sincronizaram: ${result.failed.join(', ')}` : 'Sincronização concluída. Atualizações em tempo real ativadas.', Boolean(result.failed.length));
    } catch(e) {notify(`Falha ao sincronizar: ${e.message}`,true);} finally {if(phase==='ready')$('wa-sync').disabled=false;}
  }
  async function stop() {
    try {
      await api.stop(false);
      $('wa-progress').textContent = 'Conexão pausada. Seu painel continua aberto.';
      notify('Conexão pausada. A sessão pode ser reutilizada ao conectar novamente.');
      onOffline();
    } catch(e) {notify(`Falha ao pausar: ${e.message}`,true);}
  }
  if (!api) {state('Disponível apenas no programa Windows','offline');$('wa-connect').disabled=true;return;}
  api.on('wa:state', async payload => {
    phase = payload.phase;
    const labels = { offline:'Desconectado', starting:'Iniciando…', qr:'Aguardando leitura do QR', authenticating:'Autenticando…', ready:'Conectado de verdade', error:'Erro de conexão' };
    state(labels[phase] || phase, phase);
    $('wa-progress').textContent = payload.detail || '';
    if (phase === 'ready') { $('wa-qr-wrap').hidden = true; await refresh(); }
    if (phase === 'offline') {$('wa-qr-wrap').hidden = true;all.clear();selected.clear();drawChats();}
  });
  api.on('wa:qr', ({dataUrl}) => { $('wa-qr-wrap').hidden = !dataUrl;if(dataUrl)$('wa-qr').src=dataUrl; });
  api.on('wa:error', ({message}) => notify(message,true));
  api.on('wa:batch', ({messages}) => ingest(messages));
  api.on('wa:message', msg => ingest([msg]));
  api.on('wa:progress', p => { $('wa-progress').textContent = `${p.current}/${p.total} conversas · ${p.count} mensagens · ${p.name}`; });
  $('wa-connect').addEventListener('click', connect);
  $('wa-refresh').addEventListener('click', refresh);
  $('wa-sync').addEventListener('click', sync);
  $('wa-pause').addEventListener('click', stop);
  $('wa-chat-search').addEventListener('input',drawChats);
  api.status().then(s => {phase=s.phase;state(s.phase==='ready'?'Conectado':'Desconectado',s.phase);}).catch(()=>{});
  drawChats();
}