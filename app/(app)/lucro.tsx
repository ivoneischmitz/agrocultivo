import { BarraHorizontal, Cartao, Carregando, Mensagem, Vazio } from '@/components/ui';
import { HA_POR_ALQUEIRE, listCultivosResumo, type CultivoResumo } from '@/lib/cultivos';
import { moeda } from '@/lib/formatar';
import { despesasPorCategoria } from '@/lib/movimentacoes';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Resumo financeiro da fazenda: cultivos em andamento. Era recurso Pro no app
// antigo; agora é para todos.
export default function LucroScreen() {
  const [ativos, setAtivos] = useState<CultivoResumo[] | null>(null);
  const [categorias, setCategorias] = useState<{ categoria: string; total: number }[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useRecarregarAoFocar(() => {
    listCultivosResumo()
      .then(async (l) => {
        const a = l.filter((c) => !c.finalizado);
        setAtivos(a);
        setCategorias(await despesasPorCategoria(a.map((c) => c.id)));
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  });

  if (ativos === null && !erro) return <Carregando />;

  const lista = ativos ?? [];
  const despesas = lista.reduce((s, c) => s + c.total_despesas, 0);
  const receitas = lista.reduce((s, c) => s + c.total_receitas, 0);
  const lucro = receitas - despesas;
  const maxBarra = Math.max(despesas, receitas);
  const maxCat = categorias[0]?.total ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Mensagem texto={erro} />
      <Text style={styles.titulo}>🚜 Resumo geral da fazenda</Text>
      <Text style={styles.sub}>
        {lista.length} cultivo{lista.length !== 1 ? 's' : ''} em andamento
      </Text>

      {lista.length === 0 ? (
        <Vazio icone="🌾" titulo="Nenhum cultivo em andamento" />
      ) : (
        <>
          <View style={styles.linha}>
            <Cartao style={styles.card}>
              <Text style={styles.rotulo}>💸 Total investido</Text>
              <Text style={[styles.valor, { color: cores.despesa }]}>{moeda(despesas)}</Text>
            </Cartao>
            <Cartao style={styles.card}>
              <Text style={styles.rotulo}>📈 Receita bruta</Text>
              <Text style={[styles.valor, { color: cores.receita }]}>{moeda(receitas)}</Text>
            </Cartao>
          </View>
          <Cartao style={{ alignItems: 'center', backgroundColor: lucro >= 0 ? cores.receitaClara : cores.despesaClara }}>
            <Text style={styles.rotulo}>📊 Saldo geral (lucro líquido)</Text>
            <Text style={[styles.valor, { fontSize: 28, color: lucro >= 0 ? cores.receita : cores.despesa }]}>{moeda(lucro)}</Text>
          </Cartao>

          <Cartao>
            <Text style={styles.secao}>Comparativo financeiro</Text>
            <BarraHorizontal rotulo="Despesas" valor={despesas} maximo={maxBarra} cor={cores.despesa} texto={moeda(despesas)} />
            <BarraHorizontal rotulo="Receitas" valor={receitas} maximo={maxBarra} cor={cores.receita} texto={moeda(receitas)} />
          </Cartao>

          {categorias.length > 0 && (
            <Cartao>
              <Text style={styles.secao}>Despesas por categoria</Text>
              {categorias.map((c) => (
                <BarraHorizontal key={c.categoria} rotulo={c.categoria} valor={c.total} maximo={maxCat} cor={cores.alerta} texto={moeda(c.total)} />
              ))}
            </Cartao>
          )}

          <Cartao>
            <Text style={styles.secao}>Detalhe dos cultivos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[styles.tr, styles.th]}>
                  {['Cultivo', 'Área (ha)', 'Área (alq)', 'Receitas', 'Despesas', 'Custo/ha', 'Custo/alq', 'Lucro/ha', 'Lucro'].map((h, i) => (
                    <Text key={h} style={[styles.celTh, { width: i === 0 ? 150 : i < 3 ? 80 : 110 }]}>
                      {h}
                    </Text>
                  ))}
                </View>
                {lista.map((c, idx) => {
                  const ha = c.area_hectares;
                  const alq = ha / HA_POR_ALQUEIRE;
                  const l = c.total_receitas - c.total_despesas;
                  return (
                    <View key={c.id} style={[styles.tr, idx % 2 === 1 && { backgroundColor: '#f7faf6' }]}>
                      <Text style={[styles.cel, { width: 150 }]} numberOfLines={2}>
                        {c.nome_cultura} {c.ano}
                      </Text>
                      <Text style={[styles.cel, { width: 80 }]}>{ha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</Text>
                      <Text style={[styles.cel, { width: 80 }]}>{alq.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</Text>
                      <Text style={[styles.cel, { width: 110, color: cores.receita }]}>{moeda(c.total_receitas)}</Text>
                      <Text style={[styles.cel, { width: 110, color: cores.despesa }]}>{moeda(c.total_despesas)}</Text>
                      <Text style={[styles.cel, { width: 110, color: cores.alerta }]}>{moeda(ha ? c.total_despesas / ha : 0)}</Text>
                      <Text style={[styles.cel, { width: 110, color: cores.alerta }]}>{moeda(alq ? c.total_despesas / alq : 0)}</Text>
                      <Text style={[styles.cel, { width: 110, color: l >= 0 ? cores.receita : cores.despesa }]}>{moeda(ha ? l / ha : 0)}</Text>
                      <Text style={[styles.cel, { width: 110, fontWeight: '800', color: l >= 0 ? cores.receita : cores.despesa }]}>{moeda(l)}</Text>
                    </View>
                  );
                })}
                <View style={[styles.tr, styles.totais]}>
                  <Text style={[styles.celTot, { width: 150 }]}>TOTAL</Text>
                  <Text style={[styles.celTot, { width: 160 }]} />
                  <Text style={[styles.celTot, { width: 110, color: cores.receita }]}>{moeda(receitas)}</Text>
                  <Text style={[styles.celTot, { width: 110, color: cores.despesa }]}>{moeda(despesas)}</Text>
                  <Text style={[styles.celTot, { width: 330 }]} />
                  <Text style={[styles.celTot, { width: 110, color: lucro >= 0 ? cores.receita : cores.despesa }]}>{moeda(lucro)}</Text>
                </View>
              </View>
            </ScrollView>
          </Cartao>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto },
  sub: { color: cores.textoSecundario, marginBottom: 14 },
  linha: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, alignItems: 'center' },
  rotulo: { color: cores.textoSecundario, fontSize: 13 },
  valor: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  secao: { fontSize: 16, fontWeight: '800', color: cores.texto, marginBottom: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eef2ec' },
  th: { backgroundColor: cores.primaria },
  celTh: { color: '#fff', fontWeight: '700', fontSize: 12, padding: 8 },
  cel: { fontSize: 13, padding: 8, color: cores.texto },
  totais: { backgroundColor: cores.primariaClara },
  celTot: { fontSize: 13, padding: 8, fontWeight: '800', color: cores.texto },
});
