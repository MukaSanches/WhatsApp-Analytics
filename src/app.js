import { bindLive } from './live.js';
import { parseWhatsApp } from './parser.js';
import { analyze, demoMessages } from './analytics.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const nf = new Intl.NumberFormat('pt-BR');
const pct = (n, total) => total ? `${(n / total * 100).toFixed(1).replace('.', ',')}%` : '0%';
const colors = ['#27d76b','#5db9ed','#eeb777','#af92fc','#f17e96','#a4e0bd','#e1dc69','#659bce'];
const initials = name => (name.match(/\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase();
let messages = [];
let imports = [];
let mode = 'empty';
let toastTimer;

function toast(text, error = false) {
  const node = $('toast'); node.textContent = text; node.classList.toggle('error', error); node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 4700);
}
function getFilters() {
  return { from: $('from-filter').value, to: $('to-filter').value, query: $('search-filter').value.trim(), source: $('source-filter').value };
}
function svgLine(points, color, width = 110, height = 42) {
  if (!points.length) return '';
  const max = Math.max(1, ...points), min = 0;
  const xy = points.map((v, i) => `${(i / Math.max(points.length - 1, 1) * width).toFixed(1)},${(height - 5 - (v - min) / (max - min) * (height - 14)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function renderMonthly(stats) {
  const host = $('monthly-graph');
  if (!stats.monthly.length) { host.replaceChildren(el('div','empty','Nenhuma mensagem nos filtros selecionados.')); return; }
  const last = stats.monthly.slice(-9), max = Math.max(...last.map(x => x[1]),1);
  const w = 660, h = 214, left = 34, right = 14, top = 18, bottom = 34;
  const sx = i => left + i * (w - left - right) / Math.max(last.length - 1, 1);
  const sy = v => h - bottom - v / max * (h - top - bottom);
  let svg = `<svg role="img" aria-label="Gráfico de mensagens por mês" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  for (let k = 0; k <= 4; k++) {
    const y = sy(max * k / 4);
    svg += `<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#274336" stroke-dasharray="4 5"/><text class="axis-label" x="${left-7}" y="${y+4}" text-anchor="end">${nf.format(Math.round(max*k/4))}</text>`;
  }
  const pts = last.map((v, i) => [sx(i), sy(v[1])]);
  const line = pts.map(x => x.join(',')).join(' ');
  const area = `${left},${h-bottom} ${line} ${sx(last.length-1)},${h-bottom}`;
  svg += `<defs><linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#38e17e" stop-opacity=".35"/><stop offset="1" stop-color="#38e17e" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<polygon points="${area}" fill="url(#line-fill)"/><polyline points="${line}" fill="none" stroke="#51e78b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const labels = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  last.forEach(([month,v],i) => { svg += `<circle cx="${sx(i)}" cy="${sy(v)}" r="4" fill="#70f7a6" stroke="#0b3322" stroke-width="2"/><text class="axis-label" x="${sx(i)}" y="${h-10}" text-anchor="middle">${labels[Number(month.slice(5,7))-1]}/${month.slice(2,4)}</text>`; });
  host.innerHTML = svg + '</svg>';
}
function renderDonut(stats) {
  const ranked = stats.participantsRank, top = ranked.slice(0, 6);
  let offset = 0; const stops = [];
  for (let i = 0; i < top.length; i++) {
    const share = top[i][1] / Math.max(1, stats.total) * 100;
    stops.push(`${colors[i % colors.length]} ${offset}% ${offset + share}%`);
    offset += share;
  }
  if (offset < 100) stops.push(`#3b6550 ${offset}% 100%`);
  $('donut-chart').style.background = `conic-gradient(${stops.join(',') || '#244233 0% 100%'})`;
  $('donut-total').textContent = nf.format(stats.total);
  const host = $('donut-legend'); host.replaceChildren();
  top.slice(0,5).forEach(([author,count],i) => {
    const row = el('div','legend-line'); const dot = el('i','legend-dot'); dot.style.background = colors[i];
    row.append(dot,el('span','legend-name',author),el('strong','legend-value',pct(count,stats.total)));host.append(row);
  });
  if (!top.length) host.append(el('span','empty','Sem participantes.'));
}
function renderHeat(stats) {
  const days = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'], head = $('heat-head'), body = $('heat-body');
  head.replaceChildren();body.replaceChildren();head.append(el('span','', ''));
  for (let i = 0; i < 12; i++) head.append(el('span','',`${i*2}h`));
  const combined = days.map((_,d) => Array.from({length:12},(_,i)=>stats.heat[d][i*2]+stats.heat[d][i*2+1]));
  const high = Math.max(1,...combined.flat());
  days.forEach((d,di)=>{
    body.append(el('div','heat-day',d));
    combined[di].forEach((value,hi)=>{
      const cell=el('div','heat-cell');const t=value/high;
      cell.style.background = t===0 ? '#1b382a': t<.2?'#205338':t<.45?'#227849':t<.7?'#27ad5c':'#59e990';
      cell.title = `${d} ${hi*2}h–${hi*2+2}h: ${nf.format(value)} mensagens`;
      body.append(cell);
    });
  });
  $('peak-time').textContent = stats.topHour===null ? 'Pico: —' : `Pico: ${String(stats.topHour).padStart(2,'0')}h`;
}
function renderRank(stats) {
  const host=$('participant-rank');host.replaceChildren();
  const max = stats.participantsRank[0]?.[1]||1;
  stats.participantsRank.slice(0,5).forEach(([author,count],i)=>{
    const row=el('div','rank-row'), av=el('div','rank-avatar',initials(author)), info=el('div','rank-info'), line=el('div','rank-line'), prog=el('div','progress'), fill=el('div');
    av.style.background=`${colors[i%colors.length]}24`;av.style.color=colors[i%colors.length];
    line.append(el('strong','',author),el('span','',nf.format(count)));
    fill.style.width=`${count/max*100}%`;fill.style.background=colors[i%colors.length];prog.append(fill);info.append(line,prog);
    row.append(el('div','rank-no',String(i+1).padStart(2,'0')),av,info);host.append(row);
  });
  if (!stats.participantsRank.length) host.append(el('div','empty','Sem dados para o ranking.'));
}
function renderWords(stats) {
  const host=$('word-cloud');host.replaceChildren();
  const max=stats.words[0]?.[1]||1;
  stats.words.slice(0,21).forEach(([word,count],i)=>{
    const node=el('span','',word);node.title=`${count} ocorrências`;
    const size = 10+Math.round(Math.sqrt(count/max)*9);
    node.style.fontSize=`${size}px`;
    node.style.opacity=String(Math.max(.62,1-i*.012));
    host.append(node);
  });
  if (!stats.words.length)host.append(el('div','empty','Nenhuma palavra relevante neste intervalo.'));
}
function renderEmojis(stats) {
  const host=$('emoji-grid');host.replaceChildren();
  stats.emojis.slice(0,8).forEach(([symbol,count])=>{
    const node=el('div','emoji-item');node.append(el('strong','',symbol),el('small','',nf.format(count)));host.append(node);
  });
  if (!stats.emojis.length) host.append(el('div','empty','Nenhum emoji encontrado.'));
  const ex=$('extra-stats');ex.replaceChildren();
  const a=el('span');a.append('🔗 Links: ',el('strong','',nf.format(stats.links)));
  const b=el('span');b.append('◷ Resposta mediana*: ',el('strong','',stats.responseMedianMin===null?'—':`${nf.format(Math.round(stats.responseMedianMin))} min`));
  ex.append(a,b);
  ex.title='*Tempo entre mensagens consecutivas de autores diferentes na mesma conversa, até 24 horas. Não indica leitura de mensagem.';
}
function render() {
  const s=analyze(messages,getFilters());
  $('kpi-total').textContent=nf.format(s.total);
  $('kpi-people').textContent=nf.format(s.participants);
  $('kpi-media').textContent=nf.format(s.media);
  $('kpi-avg').textContent=nf.format(Math.round(s.avgDay));
  $('active-days').textContent=nf.format(s.activeDays);
  $('dataset-tag').textContent=mode==='demo'?'● Dados de exemplo':mode==='live'?'● WhatsApp real sincronizado':mode==='imported'?'● Conversas importadas':'● Aguardando conexão';
  const df = date=>date?date.toLocaleDateString('pt-BR'):'—';
  $('date-range').textContent=`${df(s.first)} — ${df(s.last)}`;
  renderMonthly(s);renderDonut(s);renderHeat(s);renderRank(s);renderWords(s);renderEmojis(s);
  $('trace-one').innerHTML=svgLine(s.daily.slice(-15).map(v=>v[1]),'#55ef8f');
  $('trace-two').innerHTML=svgLine(s.participantsRank.map(v=>v[1]),'#63baff');
  $('trace-three').innerHTML=svgLine([1,2,2,3,4,3,5,7,5,8,7,9],'#ffbd70');
  $('trace-four').innerHTML=svgLine(s.monthly.map(v=>v[1]),'#ac9fff');
}
function refreshSources() {
  const selector=$('source-filter'), host=$('source-list'), current=selector.value;
  selector.replaceChildren(new Option('Todas as conversas','all'));host.replaceChildren();
  const names=[...new Set(messages.map(m=>m.source))];
  names.forEach(name=>{selector.add(new Option(name,name));const chip=el('button','source-chip',name);chip.title=name;chip.addEventListener('click',()=>{selector.value=name;render();});host.append(chip);});
  if (!names.length) host.append(el('span','source-placeholder','Nenhuma conversa importada'));
  selector.value=names.includes(current)?current:'all';
}
async function importFiles() {
  if (!window.desktop) { toast('A importação de arquivos funciona na versão Windows. Use a demonstração neste navegador.',true);return; }
  try {
    const files=await window.desktop.importChats();
    if (!files.length)return;
    const newMessages=[];const summaries=[];
    for (const file of files) {
      const parsed=parseWhatsApp(file.text,{dayFirst:true,source:file.name});
      if (parsed.messages.length) {newMessages.push(...parsed.messages);summaries.push(`${file.name}: ${nf.format(parsed.messages.length)}`);}
    }
    if (!newMessages.length) throw new Error('Nenhuma mensagem reconhecida. Confira o formato ou altere a ordem de data usando o parser de exemplo.');
    if (mode!=='imported') {messages=[];imports=[];}
    mode='imported';messages.push(...newMessages);imports.push(...summaries);
    $('search-filter').value='';$('from-filter').value='';$('to-filter').value='';refreshSources();render();
    toast(`${nf.format(newMessages.length)} mensagens importadas. ${files.length} arquivo(s).`);
  } catch(e) {toast(`Falha na importação: ${e.message}`,true);}
}
function resetDemo() {
  if (['imported','live'].includes(mode) && !confirm('Substituir seus dados pela demonstração?'))return;
  mode='demo';messages=demoMessages();imports=[];
  $('search-filter').value='';$('from-filter').value='';$('to-filter').value='';refreshSources();render();toast('Demonstração carregada com dados fictícios.');
}
function csvCell(value) {
  let str=String(value);
  if (/^[\s]*[=+@\-]/.test(str)) str="'"+str;
  return '"'+str.replaceAll('"','""')+'"';
}
async function exportCsv() {
  const s=analyze(messages,getFilters());
  if (!s.total){toast('Não há mensagens para exportar.',true);return;}
  const rows=[['Indicador','Valor'],['Mensagens',s.total],['Participantes',s.participants],['Dias ativos',s.activeDays],['Mídias',s.media],['Links',s.links],['Média por dia ativo',s.avgDay.toFixed(2)],[],['Participante','Mensagens'],...s.participantsRank,[],['Mês','Mensagens'],...s.monthly,[],['Palavra','Ocorrências'],...s.words];
  const content='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  try {
    if (window.desktop) { const ok=await window.desktop.saveReport({defaultName:'whatsapp-analytics-relatorio.csv',type:'csv',content});if(ok)toast('Relatório CSV salvo com sucesso.'); }
    else { const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='whatsapp-analytics-relatorio.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Relatório CSV gerado.'); }
  } catch (e) {toast(`Não foi possível exportar: ${e.message}`,true);}
}
function init() {
  ['from-filter','to-filter','source-filter'].forEach(id=>$(id).addEventListener('change',render));
  $('search-filter').addEventListener('input',render);
  $('reset-filters').addEventListener('click',()=>{$('search-filter').value='';$('from-filter').value='';$('to-filter').value='';$('source-filter').value='all';render();});
  $('import-btn').addEventListener('click',importFiles);$('hero-import').addEventListener('click',importFiles);
  $('demo-btn').addEventListener('click',resetDemo);$('export-btn').addEventListener('click',exportCsv);
  $('pdf-btn').addEventListener('click',()=>window.print());
  document.querySelectorAll('[data-go]').forEach(node=>node.addEventListener('click',()=>{
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.toggle('active',n===node));
    const section=node.dataset.go;
    $('crumb').textContent=node.textContent.trim();
    $(section).scrollIntoView({behavior:'smooth',block:'start'});
  }));
  refreshSources();render();
  bindLive({ onMessages: data => { mode = 'live';messages = data;refreshSources();render(); }, notify:toast, onOffline:()=>{} });
}
init();