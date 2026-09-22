import { BarraHorizontal, Cartao, Carregando, Chips, Mensagem, Vazio } from '@/components/ui';
import { aguardandoInicio, HA_POR_ALQUEIRE, listCultivosResumo, type CultivoResumo } from '@/lib/cultivos';
import { moeda } from '@/lib/formatar';
import { despesasPorCategoria } from '@/lib/movimentacoes';
import { useFazenda } from '@/contexts/FazendaContext';
import { useVersaoDados } from '@/lib/useVersaoDados';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Mesmas situações da lista de cultivos, e pelo mesmo motivo: 'Em andamento'
// é o que está no chão, não tudo que ainda não foi colhido.
const FILTROS = ['Todos', 'Aguardando início', 'Em andamento', 'Finalizados'] as const;
type Filtro = (typeof FILTROS)[number];

// Resumo financeiro da fazenda. Era recurso Pro no app antigo; agora é para
// todos. Mostra todos os cultivos por padrão — só a safra em andamento não
// fecha a conta do ano, que é o que interessa ao olhar o lucro.
export default function LucroScreen() {
  const [todos, setTodos] = useState<CultivoResumo[] | null>(null);
  const { fazendaId } = useFazenda();
  // Muda quando a sincronização traz algo: faz a tela reler sem trocar de aba.
  const versao = useVersaoDados();
  const [categorias, setCategorias] = useState<{ categoria: string; total: number }[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('Todos');
  const [erro, setErro] = useState<string | null>(null);

  useRecarregarAoFocar(() => {
    if (!fazendaId) return;
    listCultivosResumo(fazendaId)
      .then(setTodos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, `${fazendaId}:${versao}`);

  const lista = useMemo(
    () =>
      (todos ?? []).filter((c) => {
        if (filtro === 'Em andamento') return !c.finalizado && !aguardandoInicio(c);
        if (filtro === 'Finalizados') return c.finalizado;
        if (filtro === 'Aguardando início') return aguardandoInicio(c);
        return true;
      }),
    [todos, filtro],
  );

  // As despesas por categoria vêm de outra consulta, então acompanham o filtro.
  // A chave é texto para o efeito não disparar a cada render por causa da
  // identidade do array (os ids são uuid, que não têm vírgula).
  const ids = lista.map((c) => c.id).join(',');
  useEffect(() => {
    let atual = true;
    despesasPorCategoria(ids ? ids.split(',') : [])
      .then((c) => atual && setCategorias(c))
      .catch(() => atual && setCategorias([]));
    return () => {
      atual = false;
    };
  }, [ids]);

  if (todos === null && !erro) return <Carregando />;

  const emAndamento = (todos ?? []).filter((c) => !c.finalizado && !aguardandoInicio(c)).length;
  const aguardando = (todos ?? []).filter(aguardandoInicio).length;
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
        {(todos ?? []).length} cultivo{(todos ?? []).length !== 1 ? 's' : ''} no total ·{' '}
        {emAndamento} em andamento · {aguardando} a iniciar ·{' '}
        {(todos ?? []).filter((c) => c.finalizado).length} finalizado
        {(todos ?? []).filter((c) => c.finalizado).length !== 1 ? 's' : ''}
      </Text>
      <View style={{ marginBottom: 14 }}>
        <Chips opcoes={FILTROS} valor={filtro} onChange={setFiltro} />
      </View>

      {lista.length === 0 ? (
        <Vazio icone="🌾" titulo={`Nenhum cultivo ${filtro === 'Todos' ? 'cadastrado' : filtro.toLowerCase()}`} />
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
                        {c.finalizado ? '✅ ' : ''}
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
