import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarNucleo } from './nucleo.mjs';

const N = carregarNucleo();
const plano = (x) => JSON.parse(JSON.stringify(x));
const agora = new Date(2026, 10, 19, 22, 0);
const tar = (id, extra = {}) => ({ id, titulo: id, data: '2026-11-19', hora: null, cat: 'pessoal', feito: false, criadoEm: 1, ...extra });
const salvo = (tarefas) => JSON.stringify({ tarefas });

test('constantes de limite', () => {
  assert.equal(N.LIMITE_NOTA, 500);
  assert.equal(N.LIMITE_FOTOS, 6);
});

test('tarefa antiga sem nota/fotos continua válida', () => {
  assert.equal(N.carregar(salvo([tar('a')])).corrompido, false);
});

test('nota: 500 vale, 501 corrompe', () => {
  assert.equal(N.carregar(salvo([tar('a', { nota: 'x'.repeat(500) })])).corrompido, false);
  assert.equal(N.carregar(salvo([tar('a', { nota: 'x'.repeat(501) })])).corrompido, true);
  assert.equal(N.carregar(salvo([tar('a', { nota: 5 })])).corrompido, true);
});

test('fotos: válidas e inválidas', () => {
  assert.equal(N.carregar(salvo([tar('a', { fotos: ['a', 'b'] })])).corrompido, false);
  assert.equal(N.carregar(salvo([tar('a', { fotos: ['1', '2', '3', '4', '5', '6'] })])).corrompido, false);
  for (const fotos of [['1', '2', '3', '4', '5', '6', '7'], ['a', 'a'], [''], [1], 'a']) {
    assert.equal(N.carregar(salvo([tar('a', { fotos })])).corrompido, true, JSON.stringify(fotos));
  }
});

test('novaTarefa com nota e fotos', () => {
  const fotos = ['a'];
  const t = N.novaTarefa({ titulo: 'x', data: '2026-11-19', hora: '', cat: 'pessoal', nota: '  oi  ', fotos }, agora);
  assert.equal(t.nota, 'oi');
  assert.deepEqual(plano(t.fotos), ['a']);
  fotos.push('b');
  assert.deepEqual(plano(t.fotos), ['a']);
  const s = N.novaTarefa({ titulo: 'x', data: '2026-11-19', cat: 'pessoal' }, agora);
  assert.equal(s.nota, '');
  assert.deepEqual(plano(s.fotos), []);
});

test('normalizarNota', () => {
  assert.equal(N.normalizarNota('x'.repeat(600)).length, 500);
  assert.equal(N.normalizarNota('  a '), 'a');
  assert.equal(N.normalizarNota(undefined), '');
});

test('idsFotos', () => {
  assert.deepEqual(plano(N.idsFotos([{ fotos: ['a', 'b'] }, { fotos: ['b'] }, {}])), ['a', 'b']);
});

test('exportar v2 com mapa de fotos', () => {
  const est = { tarefas: [tar('a')], cats: plano(N.CATS_PADRAO) };
  const mapa = { a: 'data:image/jpeg;base64,AA' };
  const obj = JSON.parse(N.exportar(est, agora, mapa).conteudo);
  assert.equal(obj.versao, 2);
  assert.equal(obj.fotos.a, 'data:image/jpeg;base64,AA');
  mapa.b = 'x';
  assert.equal(obj.fotos.b, undefined);
  assert.deepEqual(JSON.parse(N.exportar(est, agora).conteudo).fotos, {});
});

test('validarBackup v1 ignora fotos e devolve {}', () => {
  const r = N.validarBackup({ app: 'agenda', tarefas: [tar('a')] });
  assert.equal(r.ok, true);
  assert.deepEqual(plano(r.fotos), {});
  const r1 = N.validarBackup({ app: 'agenda', versao: 1, tarefas: [], fotos: { a: 'lixo' } });
  assert.equal(r1.ok, true);
  assert.deepEqual(plano(r1.fotos), {});
});

test('validarBackup v2', () => {
  const ok = N.validarBackup({ app: 'agenda', versao: 2, tarefas: [tar('a', { fotos: ['z'] })], fotos: { a: 'data:image/jpeg;base64,AA' } });
  assert.equal(ok.ok, true);
  assert.deepEqual(plano(ok.fotos), { a: 'data:image/jpeg;base64,AA' });
  for (const fotos of [{ a: 'oi' }, [], null, undefined, 'x', { a: 5 }]) {
    const r = N.validarBackup({ app: 'agenda', versao: 2, tarefas: [], fotos });
    assert.deepEqual(plano(r), { ok: false, erro: 'Backup com foto inválida.' });
  }
});

test('validarBackup recusa data URL gigante (> 15 MB) sem decodificar', () => {
  const grande = 'data:image/jpeg;base64,' + 'A'.repeat(15 * 1024 * 1024);
  const r = N.validarBackup({ app: 'agenda', versao: 2, tarefas: [], fotos: { a: grande } });
  assert.deepEqual(plano(r), { ok: false, erro: 'Backup com foto inválida.' });
});

test('validarBackup com versao desconhecida', () => {
  for (const versao of [3, 0, '2', null]) {
    const r = N.validarBackup({ app: 'agenda', versao, tarefas: [] });
    assert.deepEqual(plano(r), { ok: false, erro: 'Este arquivo não é um backup da Agenda.' });
  }
});

test('validarBackup só aceita jpeg/png/webp em base64 (SVG e não-base64 são recusados)', () => {
  const ruins = [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'data:image/jpeg,xyz',
    'data:image/jpeg;base64,',
    'data:image/jpeg;base64,@@@',
    'data:image/gif;base64,AAAA',
    'data:text/html;base64,AAAA',
  ];
  for (const v of ruins) {
    const r = N.validarBackup({ app: 'agenda', versao: 2, tarefas: [], fotos: { a: v } });
    assert.deepEqual(plano(r), { ok: false, erro: 'Backup com foto inválida.' }, v);
  }
  for (const t of ['jpeg', 'png', 'webp']) {
    const r = N.validarBackup({ app: 'agenda', versao: 2, tarefas: [], fotos: { a: 'data:image/' + t + ';base64,AAAA' } });
    assert.equal(r.ok, true, t);
  }
});
