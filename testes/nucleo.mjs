import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function carregarNucleo() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/<script id="nucleo">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('bloco <script id="nucleo"> não encontrado');
  const contexto = {};
  vm.runInNewContext(m[1], contexto);
  return contexto.Nucleo;
}
