import type { Cultivo } from '@/lib/cultivos';
import { formatDataBR } from '@/lib/data';
import { moeda, quantidade } from '@/lib/formatar';
import { siglaUnidade, type Movimentacao } from '@/lib/movimentacoes';

// HTML do relatório de safra para imprimir/compartilhar em PDF (mesmo layout
// do app antigo).

function esc(t: string | null | undefined): string {
  return (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function relatorioHtml(cultivo: Cultivo, movs: Movimentacao[], produtor: string | null): string {
  const despesas = movs.filter((m) => m.tipo === 'DESPESA').reduce((s, m) => s + m.total, 0);
  const receitas = movs.filter((m) => m.tipo === 'RECEITA').reduce((s, m) => s + m.total, 0);
  const lucro = receitas - despesas;
  const agora = new Date();

  const linhas = movs
    .map((m) => {
      const itens = m.itens
        .map(
          (p) =>
            `${esc(p.descricao)} (${quantidade(p.quantidade)} ${esc(siglaUnidade(p.unidade))} × ${moeda(p.valor)} = ${moeda(
              p.quantidade * p.valor,
            )})`,
        )
        .join(', ');
      return `<tr>
        <td>${formatDataBR(m.data)}</td>
        <td><strong>${esc(m.descricao)}</strong>${m.categoria ? ` <span class="cat">${esc(m.categoria)}</span>` : ''}
          ${itens ? `<div class="itens">${itens}</div>` : ''}</td>
        <td class="${m.tipo === 'RECEITA' ? 'receita' : 'despesa'}">${m.tipo === 'RECEITA' ? '+' : '−'} ${moeda(m.total)}</td>
      </tr>`;
    })
    .join('');

  return `<html><head><meta charset="utf-8"><style>
    @page { margin: 20px; }
    body { font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #333; line-height: 1.5; }
    .topo { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2e7d32; padding-bottom: 12px; margin-bottom: 24px; }
    .app { font-size: 22px; font-weight: bold; color: #1b5e20; }
    h1 { font-size: 20px; color: #1b5e20; text-transform: uppercase; margin: 0; }
    .info { background: #f1f8e9; padding: 16px; border-radius: 10px; margin-bottom: 24px; border: 1px solid #c5e1a5; }
    .info h2 { margin: 0 0 8px; color: #1b5e20; }
    .grid { display: flex; flex-wrap: wrap; gap: 20px; }
    .rot { font-size: 11px; color: #666; text-transform: uppercase; display: block; font-weight: bold; }
    .cards { display: flex; gap: 12px; margin-bottom: 28px; }
    .card { flex: 1; padding: 12px; border-radius: 8px; text-align: center; color: #fff; }
    .card b { display: block; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #2e7d32; color: #fff; text-align: left; padding: 10px; }
    td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    .receita { color: #2e7d32; font-weight: bold; white-space: nowrap; }
    .despesa { color: #c62828; font-weight: bold; white-space: nowrap; }
    .itens { font-size: 11px; color: #666; font-style: italic; margin-top: 4px; }
    .cat { font-size: 11px; color: #666; }
    .rodape { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
  </style></head><body>
    <div class="topo">
      <div><div class="app">🌱 Agro Cultivo</div>${produtor ? `<div>Produtor: <strong>${esc(produtor)}</strong></div>` : ''}</div>
      <h1>Relatório de Safra</h1>
    </div>
    <div class="info">
      <h2>${esc(cultivo.nome_cultura)}</h2>
      <div class="grid">
        <div><span class="rot">Safra / ano</span>${esc(cultivo.ano)}</div>
        <div><span class="rot">Localidade</span>${esc(cultivo.localidade)}</div>
        ${cultivo.area_hectares ? `<div><span class="rot">Área</span>${quantidade(cultivo.area_hectares)} ha</div>` : ''}
        ${cultivo.numero_sacas ? `<div><span class="rot">Produção</span>${quantidade(cultivo.numero_sacas)} sacas</div>` : ''}
        ${
          cultivo.numero_sacas && cultivo.area_hectares
            ? `<div><span class="rot">Produtividade</span>${quantidade(Number((cultivo.numero_sacas / cultivo.area_hectares).toFixed(2)))} sc/ha</div>`
            : ''
        }
      </div>
    </div>
    <div class="cards">
      <div class="card" style="background:#c62828">Despesas<b>${moeda(despesas)}</b></div>
      <div class="card" style="background:#2e7d32">Receitas<b>${moeda(receitas)}</b></div>
      <div class="card" style="background:#1b3a1b">Lucro líquido<b>${moeda(lucro)}</b></div>
    </div>
    <table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="rodape">Relatório gerado pelo Agro Cultivo em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}</div>
  </body></html>`;
}
