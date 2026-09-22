import { BotaoConfirmar, Carregando, Mensagem, Vazio } from '@/components/ui';
import { linkDoAnexo } from '@/lib/anexos';
import { formatDataBR } from '@/lib/data';
import { moeda, quantidade } from '@/lib/formatar';
import {
  deleteMovimentacao,
  iconeCategoria,
  listMovimentacoes,
  siglaUnidade,
  type Anexo,
  type Movimentacao,
  type TipoMovimentacao,
} from '@/lib/movimentacoes';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import { useVersaoDados } from '@/lib/useVersaoDados';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export default function MovimentacoesScreen() {
  const { tipo: tipoParam } = useLocalSearchParams<{ tipo?: string }>();
  const tipo: TipoMovimentacao = tipoParam === 'RECEITA' ? 'RECEITA' : 'DESPESA';
  const receita = tipo === 'RECEITA';
  const cor = receita ? cores.receita : cores.despesa;
  const corClara = receita ? cores.receitaClara : cores.despesaClara;

  const { cultivoId, cultivo } = useCultivo();
  const [lista, setLista] = useState<Movimentacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    listMovimentacoes(cultivoId, tipo)
      .then((l) => {
        setLista(l);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }
  useRecarregarAoFocar(carregar, useVersaoDados());

  async function excluir(m: Movimentacao) {
    try {
      await deleteMovimentacao(m);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
    }
  }

  async function abrirAnexo(a: Anexo) {
    try {
      const url = await linkDoAnexo(a);
      if (Platform.OS === 'web') window.open(url, '_blank');
      else await Linking.openURL(url);
    } catch {
      setErro('Não foi possível abrir o anexo.');
    }
  }

  const formulario = (movId?: string) =>
    router.push(`/cultivos/${cultivoId}/movimentacao?tipo=${tipo}${movId ? `&mov=${movId}` : ''}` as Href);

  const total = (lista ?? []).reduce((s, m) => s + m.total, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: receita ? '💰 Receitas' : '💸 Despesas' }} />
      {lista === null && !erro ? (
        <Carregando />
      ) : (
        <FlatList
          data={lista ?? []}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.lista}
          ListHeaderComponent={
            <View style={[styles.cabecalho, { backgroundColor: corClara, borderColor: cor }]}>
              {cultivo && (
                <Text style={styles.cultivo}>
                  🌾 {cultivo.nome_cultura} · {cultivo.ano} · {cultivo.localidade}
                </Text>
              )}
              <Text style={[styles.total, { color: cor }]}>{moeda(total)}</Text>
              <Text style={styles.contagem}>
                {(lista ?? []).length} {receita ? 'receita(s)' : 'despesa(s)'}
              </Text>
              <Mensagem texto={erro} />
            </View>
          }
          ListEmptyComponent={
            <Vazio
              icone={receita ? '💰' : '📋'}
              titulo={`Nenhuma ${receita ? 'receita' : 'despesa'}`}
              subtitulo="Toque no botão abaixo para adicionar."
            />
          }
          renderItem={({ item: m }) => (
            <View style={styles.card}>
              <Pressable style={styles.cardTopo} onPress={() => formulario(m.id)}>
                <Text style={styles.icone}>{iconeCategoria(m.categoria)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.descricao}>{m.descricao}</Text>
                  <Text style={styles.sub}>
                    {m.categoria || 'Outros'} · 📅 {formatDataBR(m.data)}
                  </Text>
                </View>
                <Text style={[styles.valor, { color: cor }]}>{moeda(m.total)}</Text>
              </Pressable>

              {m.itens.length > 0 && (
                <View style={styles.itens}>
                  {m.itens.map((i) => (
                    <View key={i.id} style={styles.item}>
                      <Text style={styles.itemDesc} numberOfLines={1}>
                        {i.descricao}
                      </Text>
                      <Text style={styles.itemCalc}>
                        {quantidade(i.quantidade)} {siglaUnidade(i.unidade)} × {moeda(i.valor)} ={' '}
                        <Text style={{ color: cor, fontWeight: '700' }}>{moeda(i.quantidade * i.valor)}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {m.anexos.length > 0 && (
                <View style={styles.anexos}>
                  {m.anexos.map((a) => (
                    <Pressable key={a.id} style={styles.anexo} onPress={() => abrirAnexo(a)}>
                      <Text style={styles.anexoTexto} numberOfLines={1}>
                        {a.storage_path ? '📄' : '⏳'} {a.nome_arquivo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.acoes}>
                <Pressable onPress={() => formulario(m.id)} style={styles.editar}>
                  <Text style={styles.editarTexto}>✏️ Editar</Text>
                </Pressable>
                <BotaoConfirmar titulo="🗑️ Excluir" confirmar="Confirmar exclusão?" pequeno onConfirmar={() => excluir(m)} />
              </View>
            </View>
          )}
        />
      )}
      <Pressable style={[styles.fab, { backgroundColor: cor }]} onPress={() => formulario()} accessibilityRole="button">
        <Text style={styles.fabTexto}>+ {receita ? 'Nova receita' : 'Nova despesa'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, paddingBottom: 96, maxWidth: 900, width: '100%', alignSelf: 'center' },
  cabecalho: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  cultivo: { color: cores.texto, fontWeight: '600', textAlign: 'center' },
  total: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  contagem: { color: cores.textoSecundario, fontSize: 13 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icone: { fontSize: 24 },
  descricao: { fontSize: 16, fontWeight: '700', color: cores.texto },
  sub: { fontSize: 12, color: cores.textoSecundario, marginTop: 2 },
  valor: { fontSize: 16, fontWeight: '800' },
  itens: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eef2ec', gap: 6 },
  item: {},
  itemDesc: { color: cores.texto, fontSize: 13 },
  itemCalc: { color: cores.textoSecundario, fontSize: 12 },
  anexos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  anexo: { backgroundColor: cores.fundo, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 220 },
  anexoTexto: { fontSize: 12, color: cores.chuva },
  acoes: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 },
  editar: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: cores.primariaClara },
  editarTexto: { color: cores.primariaEscura, fontWeight: '600', fontSize: 13 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 22,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
