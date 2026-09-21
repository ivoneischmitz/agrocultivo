import { BarraHorizontal, Botao, Cartao, Carregando, Mensagem, Vazio } from '@/components/ui';
import { compartilharPdf } from '@/lib/compartilhar';
import { formatDataBR } from '@/lib/data';
import { moeda, quantidade } from '@/lib/formatar';
import { imprimirHtml } from '@/lib/imprimir';
import { listMovimentacoes, siglaUnidade, type Movimentacao } from '@/lib/movimentacoes';
import { useFazenda } from '@/contexts/FazendaContext';
import { getPerfil } from '@/lib/perfil';
import { relatorioHtml } from '@/lib/relatorioHtml';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

const CORES_GRAFICO = ['#c62828', '#ef6c00', '#6a1b9a', '#1565c0', '#00838f', '#558b2f', '#ad1457'];

export default function RelatorioScreen() {
  const { cultivoId, cultivo, erro: erroCultivo } = useCultivo();
  const { fazenda } = useFazenda();
  const [movs, setMovs] = useState<Movimentacao[] | null>(null);
  const [produtor, setProdutor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  useRecarregarAoFocar(() => {
    listMovimentacoes(cultivoId)
      .then(setMovs)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  });

  // No cabeçalho do relatório sai o proprietário da fazenda; na falta dele, o
  // nome de quem está usando o app.
  useEffect(() => {
    getPerfil()
      .then((p) => setProdutor(fazenda?.proprietario || p.nome || null))
      .catch(() => setProdutor(fazenda?.proprietario || null));
  }, [fazenda]);

  const resumo = useMemo(() => {
    const lista = movs ?? [];
    const despesas = lista.filter((m) => m.tipo === 'DESPESA');
    const receitas = lista.filter((m) => m.tipo === 'RECEITA');
    const porDescricao = new Map<string, number>();
    for (const m of despesas) porDescricao.set(m.descricao, (porDescricao.get(m.descricao) ?? 0) + m.total);
    return {
      despesas: despesas.reduce((s, m) => s + m.total, 0),
      receitas: receitas.reduce((s, m) => s + m.total, 0),
      grafico: [...porDescricao.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [movs]);

  if (erroCultivo) return <View style={{ padding: 16 }}><Mensagem texto={erroCultivo} /></View>;
  if (!cultivo || movs === null) return <Carregando />;

  const lucro = resumo.receitas - resumo.despesas;
  const maxGrafico = resumo.grafico[0]?.total ?? 0;

  async function imprimir() {
    setErro(null);
    try {
      await imprimirHtml(relatorioHtml(cultivo!, movs!, produtor));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível imprimir.');
    }
  }

  async function compartilhar() {
    setErro(null);
    setAviso(null);
    setGerando(true);
    try {
      const r = await compartilharPdf(
        relatorioHtml(cultivo!, movs!, produtor),
        `Relatorio-${cultivo!.nome_cultura}-${cultivo!.ano}`,
      );
      if (r === 'impressao-web') setAviso('Na janela de impressão, escolha "Salvar como PDF".');
      if (r === 'indisponivel') setErro('Compartilhamento indisponível neste aparelho.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Cartao style={{ backgroundColor: cores.relatorioClara, borderColor: '#ce93d8' }}>
        <Text style={styles.nome}>🌾 {cultivo.nome_cultura}</Text>
        <Text style={styles.sub}>
          📅 {cultivo.ano}   📍 {cultivo.localidade}
          {cultivo.area_hectares ? `   📏 ${quantidade(cultivo.area_hectares)} ha` : ''}
        </Text>
        {!!produtor && <Text style={styles.sub}>👤 {produtor}</Text>}
        <View style={styles.botoes}>
          <Botao titulo="🖨️ Imprimir" cor={cores.relatorio} pequeno onPress={imprimir} style={{ flex: 1 }} />
          <Botao
            titulo={Platform.OS === 'web' ? '📄 Salvar PDF' : '📤 Compartilhar PDF'}
            cor={cores.relatorio}
            contorno
            pequeno
            carregando={gerando}
            onPress={compartilhar}
            style={{ flex: 1 }}
          />
        </View>
      </Cartao>

      <Mensagem texto={erro} />
      <Mensagem texto={aviso} tipo="sucesso" />

      <Cartao style={{ alignItems: 'center', backgroundColor: lucro >= 0 ? cores.receitaClara : cores.despesaClara }}>
        <Text style={styles.rotulo}>Lucro líquido estimado</Text>
        <Text style={[styles.lucro, { color: lucro >= 0 ? cores.receita : cores.despesa }]}>{moeda(lucro)}</Text>
        {cultivo.area_hectares > 0 && <Text style={styles.sub}>{moeda(lucro / cultivo.area_hectares)} / ha</Text>}
      </Cartao>

      <View style={styles.linha}>
        <Cartao style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.rotulo}>💸 Despesas</Text>
          <Text style={[styles.valor, { color: cores.despesa }]}>{moeda(resumo.despesas)}</Text>
        </Cartao>
        <Cartao style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.rotulo}>💰 Receitas</Text>
          <Text style={[styles.valor, { color: cores.receita }]}>{moeda(resumo.receitas)}</Text>
        </Cartao>
      </View>

      {cultivo.numero_sacas > 0 && cultivo.area_hectares > 0 && (
        <Cartao style={{ alignItems: 'center' }}>
          <Text style={styles.rotulo}>🌾 Produtividade média</Text>
          <Text style={[styles.valor, { color: cores.alerta }]}>
            {quantidade(Number((cultivo.numero_sacas / cultivo.area_hectares).toFixed(2)))} sacas / ha
          </Text>
        </Cartao>
      )}

      {resumo.grafico.length > 0 && (
        <Cartao>
          <Text style={styles.secao}>Despesas por descrição</Text>
          {resumo.grafico.map((g, i) => (
            <BarraHorizontal
              key={g.nome}
              rotulo={g.nome}
              valor={g.total}
              maximo={maxGrafico}
              cor={CORES_GRAFICO[i % CORES_GRAFICO.length]}
              texto={`${moeda(g.total)} · ${resumo.despesas > 0 ? ((g.total / resumo.despesas) * 100).toFixed(1) : 0}%`}
            />
          ))}
        </Cartao>
      )}

      <Text style={[styles.secao, { marginTop: 8 }]}>📋 Detalhamento</Text>
      {movs.length === 0 ? (
        <Vazio icone="📉" titulo="Sem dados para o relatório" subtitulo="Lance despesas e receitas para ver os totais." />
      ) : (
        movs.map((m) => {
          const cor = m.tipo === 'RECEITA' ? cores.receita : cores.despesa;
          return (
            <Cartao key={m.id}>
              <View style={styles.movTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.movDesc}>{m.descricao}</Text>
                  <Text style={styles.sub}>
                    {m.tipo === 'RECEITA' ? 'Receita' : 'Despesa'} · 📅 {formatDataBR(m.data)}
                  </Text>
                </View>
                <Text style={[styles.valor, { color: cor, fontSize: 16 }]}>{moeda(m.total)}</Text>
              </View>
              {m.itens.map((i) => (
                <Text key={i.id} style={styles.item}>
                  {i.descricao}: {quantidade(i.quantidade)} {siglaUnidade(i.unidade)} × {moeda(i.valor)} = {moeda(i.quantidade * i.valor)}
                </Text>
              ))}
            </Cartao>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 900, width: '100%', alignSelf: 'center' },
  nome: { fontSize: 20, fontWeight: '800', color: cores.texto },
  sub: { color: cores.textoSecundario, fontSize: 13, marginTop: 2 },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rotulo: { color: cores.textoSecundario, fontSize: 13 },
  lucro: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  valor: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  linha: { flexDirection: 'row', gap: 12 },
  secao: { fontSize: 16, fontWeight: '800', color: cores.texto, marginBottom: 12 },
  movTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  movDesc: { fontSize: 15, fontWeight: '700', color: cores.texto },
  item: { fontSize: 12, color: cores.textoSecundario, marginTop: 4 },
});
