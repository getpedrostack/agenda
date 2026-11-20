"""Gera os ícones da Agenda (PNG) na paleta Original Coffee Roaster.

Desenho: uma folha de agenda em pêssego (faixa de cabeçalho + três linhas de tarefa, com o círculo do dia
à esquerda da primeira), sobre petróleo. Tudo é desenhado em coordenadas de 512 e renderizado a 4x, depois
reduzido com LANCZOS para bordas limpas.
- maskable (icon-192/512, apple-touch-icon): fundo cheio; desenho dentro da zona segura (círculo de raio 204,8).
- any (icon-any-192/512, icon-32): fundo quadrado arredondado, desenho maior.
Uso (na pasta do app): python marca/gerar_icones.py .
"""
import math, sys, pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
PETROLEO, PESSEGO = '#104a53', '#fad9b8'
SS = 4


def folha(d, k):
    """Desenha a folha em coordenadas de 512, ampliada por k em torno do centro; devolve o ponto mais distante."""
    def P(x, y):
        return (256 + (x - 256) * k, 256 + (y - 256) * k)

    def ret(x0, y0, x1, y1, r, fill):
        a, b = P(x0, y0), P(x1, y1)
        d.rounded_rectangle([a[0], a[1], b[0], b[1]], radius=r * k, fill=fill)

    x0, y0, x1, y1 = 146, 106, 366, 406
    ret(x0, y0, x1, y1, 38, PESSEGO)                       # folha (contorno de 18 + faixa)
    ret(x0 + 18, y0 + 66, x1 - 18, y1 - 18, 22, PETROLEO)  # miolo; sobra a faixa de cabeçalho no alto
    # círculo do dia + três barras de tarefa
    for i, y in enumerate((236, 296, 356)):
        xb = 222 if i == 0 else 178
        ret(xb, y - 10, 334, y + 10, 10, PESSEGO)
    cx, cy = P(190, 236)
    r = 17 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PESSEGO)
    # ponto mais distante do centro do ícone (cantos da folha)
    return max(math.dist((256, 256), (x, y)) for x in (x0, x1) for y in (y0, y1))


def desenha(px, maskable):
    S = px * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, S, S], fill=PETROLEO)
        k = 1.0
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=PETROLEO)
        k = 1.12 if px >= 64 else 1.3  # favicon: desenho maior
    # desenha em 512 sobre uma camada própria e amplia para S
    cam = Image.new('RGBA', (512 * SS, 512 * SS), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cam)
    class Esc:  # redireciona o desenho de 512 para a camada de 512*SS
        def rounded_rectangle(self, b, radius, fill): dc.rounded_rectangle([v * SS for v in b], radius=radius * SS, fill=fill)
        def ellipse(self, b, fill): dc.ellipse([v * SS for v in b], fill=fill)
    longe = folha(Esc(), k)
    if maskable:
        assert longe * k + 9 <= 204.8, longe
    cam = cam.resize((S, S), Image.LANCZOS)
    im.alpha_composite(cam)
    return im.resize((px, px), Image.LANCZOS)


alvos = [('icon-512.png', 512, True), ('icon-192.png', 192, True), ('apple-touch-icon.png', 180, True),
         ('icon-any-512.png', 512, False), ('icon-any-192.png', 192, False), ('icon-32.png', 32, False)]
for nome, px, mask in alvos:
    im = desenha(px, mask)
    if mask:
        im = im.convert('RGB')
    im.save(OUT / nome, optimize=True)
    print(nome, im.size, (OUT / nome).stat().st_size, 'bytes')
