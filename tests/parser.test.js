import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsApp } from '../src/parser.js';
import { analyze, demoMessages } from '../src/analytics.js';

test('Android 24h, linhas múltiplas e sistema', () => {
  const text = '09/10/2026, 18:02 - Alice: Olá\ncontinuação aqui\n09/10/2026, 18:03 - Bob: Boa tarde! 😂\n09/10/2026, 18:04 - Mensagens e ligações são protegidas\n09/10/2026, 18:05 - Alice: <mídia oculta>';
  const out = parseWhatsApp(text,{source:'grupo'});
  assert.equal(out.messages.length,3);
  assert.equal(out.messages[0].text,'Olá\ncontinuação aqui');
  assert.equal(out.messages[0].source,'grupo');
  assert.equal(out.messages[2].media,true);
  assert.equal(out.ignored,1);
  const stats = analyze(out.messages);
  assert.equal(stats.total,3);
  assert.equal(stats.media,1);
  assert.equal(stats.participants,2);
  assert.deepEqual(stats.participantsRank,[['Alice',2],['Bob',1]]);
});

test('iOS com AM/PM e ano de dois dígitos', () => {
  const out = parseWhatsApp('[10/9/26, 6:02:04 PM] Ana: Cheguei\n[10/9/26, 6:12 PM] Bruno: Tudo bem?', {dayFirst:false});
  assert.equal(out.messages.length,2);
  assert.equal(out.messages[0].date.getHours(),18);
  assert.equal(out.messages[0].date.getMonth(),9);
  assert.equal(out.messages[0].date.getDate(),9);
});

test('filtros de datas, busca, conversa e dados vazios', () => {
  const source = '09/10/2026, 10:00 - A: Projeto verde\n10/10/2026, 10:00 - B: Café';
  const data = parseWhatsApp(source,{source:'Equipe'}).messages;
  assert.equal(analyze(data,{query:'verde'}).total,1);
  assert.equal(analyze(data,{from:'2026-10-10'}).total,1);
  assert.equal(analyze(data,{to:'2026-10-09'}).total,1);
  assert.equal(analyze(data,{source:'Não existe'}).total,0);
  assert.equal(analyze([],{}).topHour,null);
});

test('datas inválidas não geram mensagens artificiais', () => {
  const out = parseWhatsApp('32/13/2026, 25:61 - Ana: Errado');
  assert.equal(out.messages.length,0);
});

test('demonstração tem dados estáveis e analisáveis', () => {
  const data = demoMessages();
  assert.equal(data.length,1480);
  assert.equal(analyze(data).participants,4);
  assert.equal(analyze(data).total,1480);
  assert.ok(analyze(data).monthly.length>=5);
});

test('respostas não atravessam conversas', () => {
  const a = {date:new Date(2026,9,9,10),author:'Ana',source:'A',text:'Olá'};
  const b = {date:new Date(2026,9,9,10,1),author:'Bruno',source:'B',text:'Sim'};
  const result = analyze([a,b]);
  assert.equal(result.responseMedianMin,null);
});