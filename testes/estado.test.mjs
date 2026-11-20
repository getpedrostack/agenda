import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarNucleo } from './nucleo.mjs';

const N = carregarNucleo();
const plano = (x) => JSON.parse(JSON.stringify(x));
const agora = new Date(2026, 10, 19, 22, 0);
const tar = (id, extra = {}) => ({ id, titulo: id, data: '2026-11-19', hora: null, cat: 'pessoal', feito: false, criadoEm: 1, ...extra });

test('CATS_PADRAO tem as 4 categorias', () => {
  assert.deepEqual(plano(N.CATS_PADRAO), [
    { id: 'pessoal', nome: 'Pessoal', cor: '#5bb8bd' },
    { id: 'torrefacao', nome: 'Torrefação', cor: '#ba744d' },
    { id: 'forro', nome: 'Forró', cor: '#da9c5e' },
    { id: 'saude', nome: 'Saúde', cor: '#fad9b8' },
  ]);
});

test('estadoInicial é novo a cada chamada', () => {
  const a = N.estadoInicial();
  assert.equal(a.cats.length, 4);
  assert.deepEqual(plano(a.tarefas), []);
  a.cats[0].nome = 'X';
  a.cats.pop();
  assert.equal(N.CATS_PADRAO[0].nome, 'Pessoal');
  assert.equal(N.CATS_PADRAO.length, 4);
  assert.equal(N.estadoInicial().cats.length, 4);
});

test('carregar(null) dá o inicial sem corrupção', () => {
  const r = N.carregar(null);
  assert.equal(r.estado.cats.length, 4);
  assert.equal(r.corrompido, false);
});

test('carregar com JSON inválido ou sem tarefas é corrompido e vazio', () => {
  for (const txt of ['{lixo', '{"cats":[]}', '[]', 'null', '42', '{"tarefas":"x"}']) {
    const r = N.carregar(txt);
    assert.equal(r.corrompido, true, txt);
    assert.deepEqual(plano(r.estado.tarefas), [], txt);
    assert.equal(r.estado.cats.length, 4, txt);
  }
});

test('carregar texto válido sem cats usa cópias de CATS_PADRAO', () => {
  const r = N.carregar(JSON.stringify({ tarefas: [tar('a')] }));
  assert.equal(r.corrompido, false);
  assert.equal(r.estado.tarefas.length, 1);
  assert.equal(r.estado.cats.length, 4);
  r.estado.cats[0].nome = 'X';
  assert.equal(N.CATS_PADRAO[0].nome, 'Pessoal');
});

test('carregar devolve objetos novos a cada chamada', () => {
  const a = N.carregar(null).estado;
  a.cats[0].cor = '#000';
  a.cats.pop();
  assert.equal(N.carregar(null).estado.cats.length, 4);
  assert.equal(N.carregar(null).estado.cats[0].cor, '#5bb8bd');
});

test('carregar mantém tarefa com categoria ausente nas cats', () => {
  const txt = JSON.stringify({ tarefas: [tar('a', { cat: 'sumiu' })], cats: [{ id: 'pessoal', nome: 'P', cor: '#111111' }] });
  const r = N.carregar(txt);
  assert.equal(r.estado.tarefas[0].cat, 'sumiu');
  assert.equal(r.estado.cats.length, 1);
});

test('novaTarefa corta espaços e preenche campos', () => {
  const t = N.novaTarefa({ titulo: '  Dentista ', data: '2026-11-19', hora: null, cat: 'saude' }, agora);
  assert.equal(t.titulo, 'Dentista');
  assert.equal(t.data, '2026-11-19');
  assert.equal(t.hora, null);
  assert.equal(t.cat, 'saude');
  assert.equal(t.feito, false);
  assert.equal(t.criadoEm, agora.getTime());
  assert.equal(typeof t.id, 'string');
  assert.ok(t.id.length >= 4);
  const outra = N.novaTarefa({ titulo: 'x', data: '2026-11-19', hora: '09:00', cat: 'saude' }, agora);
  assert.notEqual(outra.id, t.id);
});

test('novaTarefa recusa título vazio', () => {
  assert.throws(() => N.novaTarefa({ titulo: '   ', data: '2026-11-19', hora: null, cat: 'saude' }, agora), { message: 'titulo' });
  assert.throws(() => N.novaTarefa({ data: '2026-11-19', hora: null, cat: 'saude' }, agora), { message: 'titulo' });
});

test('exportar gera nome com o dia local e JSON formatado', () => {
  const est = N.estadoInicial();
  est.tarefas.push(tar('a'));
  const r = N.exportar(est, agora);
  assert.equal(r.nome, 'agenda-backup-2026-11-19.json');
  const obj = JSON.parse(r.conteudo);
  assert.equal(obj.app, 'agenda');
  assert.equal(obj.versao, 1);
  assert.equal(obj.exportadoEm, agora.toISOString());
  assert.equal(obj.tarefas.length, 1);
  assert.equal(obj.cats.length, 4);
  assert.ok(r.conteudo.includes('\n  "app"'), 'indentação de 2 espaços');
});

test('validarBackup recusa o que não é backup, sem lançar', () => {
  for (const lixo of [null, undefined, 42, 'x', [], {}, { app: 'outro' }, { app: 'agenda', versao: 1 }, { app: 'agenda', tarefas: 'x' }]) {
    const r = N.validarBackup(lixo);
    assert.equal(r.ok, false);
    assert.equal(typeof r.erro, 'string');
    assert.ok(r.erro.length > 0);
  }
  assert.equal(N.validarBackup({ app: 'outro' }).erro, 'Este arquivo não é um backup da Agenda.');
});

test('validarBackup recusa compromisso inválido', () => {
  const base = { app: 'agenda', versao: 1 };
  const ruins = [
    { id: 'a', titulo: 'x', data: '19/11/2026' },
    { id: 'a', titulo: 'x' },
    { titulo: 'x', data: '2026-11-19' },
    { id: 'a', titulo: 5, data: '2026-11-19' },
    null,
    'texto',
  ];
  for (const t of ruins) {
    const r = N.validarBackup({ ...base, tarefas: [t] });
    assert.equal(r.ok, false);
    assert.equal(r.erro, 'Backup com compromisso inválido.');
  }
});

test('validarBackup aceita e devolve cópias; sem cats usa o padrão', () => {
  const orig = { app: 'agenda', versao: 1, tarefas: [tar('a')] };
  const r = N.validarBackup(orig);
  assert.equal(r.ok, true);
  assert.equal(r.tarefas.length, 1);
  assert.equal(r.cats.length, 4);
  r.tarefas[0].titulo = 'mudou';
  r.cats[0].nome = 'X';
  assert.equal(orig.tarefas[0].titulo, 'a');
  assert.equal(N.CATS_PADRAO[0].nome, 'Pessoal');
  const r2 = N.validarBackup({ ...orig, cats: [{ id: 'z', nome: 'Z', cor: '#fff' }] });
  assert.equal(r2.cats.length, 1);
});

test('exportar e validarBackup fazem ida e volta', () => {
  const est = N.estadoInicial();
  est.tarefas.push(tar('a', { hora: '10:00' }));
  const v = N.validarBackup(JSON.parse(N.exportar(est, agora).conteudo));
  assert.equal(v.ok, true);
  assert.deepEqual(plano(v.tarefas), plano(est.tarefas));
});

test('juntar adiciona só ids novos, sem mutar as entradas', () => {
  const estado = { tarefas: [tar('a', { titulo: 'local' })], cats: [{ id: 'pessoal', nome: 'Local', cor: '#111111' }] };
  const backup = {
    tarefas: [tar('a', { titulo: 'backup' }), tar('b')],
    cats: [{ id: 'pessoal', nome: 'Backup', cor: '#222222' }, { id: 'nova', nome: 'Nova', cor: '#333333' }],
  };
  const antesE = JSON.stringify(estado);
  const antesB = JSON.stringify(backup);
  const r = N.juntar(estado, backup);
  assert.equal(r.tarefas.length, 2);
  assert.equal(r.tarefas.find((t) => t.id === 'a').titulo, 'local');
  assert.ok(r.tarefas.some((t) => t.id === 'b'));
  assert.deepEqual(plano(r.cats.map((c) => [c.id, c.nome])), [['pessoal', 'Local'], ['nova', 'Nova']]);
  assert.equal(JSON.stringify(estado), antesE);
  assert.equal(JSON.stringify(backup), antesB);
  r.tarefas[0].titulo = 'X';
  r.cats[0].nome = 'X';
  assert.equal(JSON.stringify(estado), antesE);
});

test('validarBackup recusa categoria inválida', () => {
  for (const cats of [[null], [{ id: 5 }], [{}], 'x', [{ id: 'a', nome: 'A' }]]) {
    const r = N.validarBackup({ app: 'agenda', versao: 1, tarefas: [], cats });
    assert.equal(r.ok, false);
    assert.equal(r.erro, 'Backup com categoria inválida.');
  }
});

test('carregar trata elementos inválidos como corrompido', () => {
  for (const o of [
    { tarefas: [null] },
    { tarefas: [{ id: 'a', titulo: 'x', data: '19/11/2026' }] },
    { tarefas: [], cats: [null] },
    { tarefas: [], cats: [{ id: 5 }] },
  ]) {
    const r = N.carregar(JSON.stringify(o));
    assert.equal(r.corrompido, true, JSON.stringify(o));
    assert.deepEqual(plano(r.estado.tarefas), []);
    assert.equal(r.estado.cats.length, 4);
  }
  assert.equal(N.carregar('[1]').corrompido, true);
});
