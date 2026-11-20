import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { carregarNucleo } from './nucleo.mjs';

const N = carregarNucleo();
const plano = (x) => JSON.parse(JSON.stringify(x));
const t = (id, data, hora = null, criadoEm = 0, cat = 'pessoal') =>
  ({ id, titulo: id, data, hora, cat, feito: false, criadoEm });

test('isoDia usa a data local (fuso de São Paulo, offset negativo)', () => {
  const nucleo = new URL('./nucleo.mjs', import.meta.url).href;
  const codigo = `import(${JSON.stringify(nucleo)}).then(({carregarNucleo}) => {
    const d = new Date(2026, 10, 19, 23, 30);
    console.log(JSON.stringify([d.getTimezoneOffset(), carregarNucleo().isoDia(d)]));
  });`;
  const r = spawnSync(process.execPath, ['-e', codigo], { env: { ...process.env, TZ: 'America/Sao_Paulo' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [offset, iso] = JSON.parse(r.stdout);
  assert.ok(offset > 0, 'TZ não foi aplicado: offset ' + offset);
  assert.equal(iso, '2026-11-19');
});

test('deIso devolve meia-noite local', () => {
  const d = N.deIso('2026-11-19');
  assert.equal([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()].join(','), '2026,10,19,0');
});

test('somaDias', () => {
  assert.equal(N.somaDias('2026-11-30', 1), '2026-12-01');
  assert.equal(N.somaDias('2026-03-01', -1), '2026-02-28');
});

test('inicioSemana é o domingo', () => {
  assert.equal(N.inicioSemana('2026-11-19'), '2026-11-15');
  assert.equal(N.inicioSemana('2026-11-15'), '2026-11-15');
});

test('ordenarDia: sem hora primeiro, depois hora, desempate por criadoEm', () => {
  const entrada = [{ id: 'a', hora: '14:30' }, { id: 'b', hora: null }, { id: 'c', hora: '08:00' }];
  assert.deepEqual(N.ordenarDia(entrada).map((x) => x.hora), [null, '08:00', '14:30']);
  assert.equal(entrada[0].id, 'a');
  const emp = [{ id: 'x', hora: '09:00', criadoEm: 2 }, { id: 'y', hora: '09:00', criadoEm: 1 }];
  assert.deepEqual(N.ordenarDia(emp).map((x) => x.id), ['y', 'x']);
});

test('montarLinha vazia mostra só hoje', () => {
  assert.deepEqual(plano(N.montarLinha([], '2026-11-19')), [{ tipo: 'dia', data: '2026-11-19', tarefas: [] }]);
});

test('montarLinha com buraco curto', () => {
  const L = plano(N.montarLinha([t('a', '2026-11-19'), t('b', '2026-11-20'), t('c', '2026-11-24')], '2026-11-19'));
  assert.deepEqual(L.map((i) => i.tipo), ['dia', 'dia', 'livres', 'dia']);
  assert.equal(L[0].data, '2026-11-19');
  assert.equal(L[1].data, '2026-11-20');
  assert.deepEqual(L[2], { tipo: 'livres', de: '2026-11-21', ate: '2026-11-23', n: 3 });
  assert.equal(L[3].data, '2026-11-24');
});

test('montarLinha com compromisso daqui a meses tem um único livres', () => {
  const L = plano(N.montarLinha([t('a', '2026-11-19'), t('b', '2027-06-01')], '2026-11-19'));
  assert.equal(L.length, 3);
  assert.equal(L[1].tipo, 'livres');
  assert.equal(L[1].n, 193);
});

test('rotuloLivres', () => {
  assert.equal(N.rotuloLivres('2026-11-22', '2026-11-23', 2), 'dom 22 · seg 23 — livres');
  assert.equal(N.rotuloLivres('2026-11-22', '2026-11-22', 1), 'dom 22 — livres');
  assert.equal(N.rotuloLivres('2026-11-22', '2026-11-24', 3), 'dom 22 · seg 23 · ter 24 — livres');
  assert.equal(N.rotuloLivres('2026-11-24', '2026-12-02', 9), '24 nov – 2 dez · 9 dias livres');
});

test('semana tem 7 dias com tarefas ordenadas', () => {
  const S = plano(N.semana([t('a', '2026-11-16', '10:00'), t('b', '2026-11-16', null)], '2026-11-15'));
  assert.equal(S.length, 7);
  assert.equal(S[0].data, '2026-11-15');
  assert.equal(S[6].data, '2026-11-21');
  assert.deepEqual(S[1].tarefas.map((x) => x.id), ['b', 'a']);
});

test('gradeMes de novembro de 2026', () => {
  const G = plano(N.gradeMes(2026, 10));
  assert.equal(G.length, 35);
  assert.deepEqual(G[0], { data: '2026-11-01', doMes: true });
  assert.deepEqual(G[34], { data: '2026-12-05', doMes: false });
});

test('gradeMes com 42 células', () => {
  assert.equal(N.gradeMes(2026, 7).length, 42); // ago/2026 começa no sábado
});

test('pontosDia limita a 3 cores e marca mais', () => {
  const cats = [{ id: 'pessoal', nome: 'Pessoal', cor: '#111111' }, { id: 'forro', nome: 'Forró', cor: '#222222' }];
  const ts = ['a', 'b', 'c', 'd', 'e'].map((id, i) => t(id, '2026-11-19', '0' + i + ':00', i, i < 2 ? 'forro' : 'pessoal'));
  const p = plano(N.pontosDia(ts, '2026-11-19', cats));
  assert.equal(p.cores.length, 3);
  assert.equal(p.mais, true);
  assert.deepEqual(p.cores, ['#222222', '#222222', '#111111']);
});

test('pontosDia: categoria ausente usa a cor padrão', () => {
  const p = plano(N.pontosDia([t('a', '2026-11-19', null, 0, 'sumiu')], '2026-11-19', []));
  assert.deepEqual(p, { cores: ['#5bb8bd'], mais: false });
});

test('gradeMes de mês de 28 dias começando no domingo tem 35 células', () => {
  const G = plano(N.gradeMes(2026, 1));
  assert.equal(G.length, 35);
  assert.deepEqual(G[0], { data: '2026-02-01', doMes: true });
  assert.deepEqual(G[34], { data: '2026-03-07', doMes: false });
});
