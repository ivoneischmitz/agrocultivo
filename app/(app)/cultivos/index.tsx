import { BotaoConfirmar, Carregando, Chips, Mensagem, Vazio } from '@/components/ui';
import { deleteCultivo, listCultivosResumo, progressoCultivo, type CultivoResumo } from '@/lib/cultivos';
import { moeda, quantidade } from '@/lib/formatar';
import { normalize } from '@/lib/normalize';
import { useFazenda } from '@/contexts/FazendaContext';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const FILTROS = ['Todos', 'Em andamento', 'Finalizados'] as const;
type Filtro = (typeof FILTROS)[number];

export default function CultivosScreen() {
  const [cultivos, setCultivos] = useState<CultivoResumo[] | null>(null);
  const { fazendaId } = useFazenda();
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('Todos');
  const [busca, setBusca] = useState('');

  function carregar() {
    if (!fazendaId) return;
    listCultivosResumo(fazendaId)
      .then((l) => {
        setCultivos(l);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar cultivos.'));
  }

  useRecarregarAoFocar(carregar, fazendaId);

  const filtrados = useMemo(() => {
    const termo = normalize(busca.trim());
    return (cultivos ?? []).filter((c) => {
      if (filtro === 'Em andamento' && c.finalizado) return false;
      if (filtro === 'Finalizados' && !c.finalizado) return false;
      if (!termo) return true;
      return (
        normalize(c.nome_cultura).includes(termo) ||
        normalize(c.localidade ?? '').includes(termo) ||
        c.ano.includes(termo)
      );
    });
  }, [cultivos, filtro, busca]);

  if (cultivos === null && !erro) return <Carregando />;

  const lista = cultivos ?? [];
  const ativos = lista.filter((c) => !c.finalizado).length;
  const hectares = lista.reduce((s, c) => s + c.area_hectares, 0);

  async function excluir(c: CultivoResumo) {
    try {
      await deleteCultivo(c.id);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={filtrados}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View>
            <View style={styles.stats}>
              <Stat valor={String(lista.length)} rotulo="Total" cor={cores.texto} />
              <Stat valor={String(ativos)} rotulo="Ativos" cor={cores.primaria} />
              <Stat valor={String(lista.length - ativos)} rotulo="Finalizados" cor={cores.chuva} />
              <Stat valor={quantidade(Math.round(hectares))} rotulo="Hectares" cor={cores.alerta} />
            </View>
            <TextInput
              style={styles.busca}
              placeholder="🔍 Buscar por cultura, localidade ou ano..."
              placeholderTextColor="#9aa89a"
              value={busca}
              onChangeText={setBusca}
            />
            <Chips opcoes={FILTROS} valor={filtro} onChange={setFiltro} />
            <Mensagem texto={erro} />
            <Text style={styles.contagem}>
              {filtrados.length} cultivo{filtrados.length !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          lista.length === 0 ? (
            <Vazio icone="🌾" titulo="Nenhum cultivo cadastrado" subtitulo='Toque em "+ Novo cultivo" para começar.' />
          ) : (
            <Vazio icone="🔍" titulo="Nenhum resultado" subtitulo="Ajuste a busca ou o filtro." />
          )
        }
        renderItem={({ item }) => <CartaoCultivo c={item} onExcluir={() => excluir(item)} />}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/cultivos/novo')} accessibilityRole="button">
        <Text style={styles.fabTexto}>+ Novo cultivo</Text>
      </Pressable>
    </View>
  );
}

function Stat({ valor, rotulo, cor }: { valor: string; rotulo: string; cor: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.statRotulo}>{rotulo}</Text>
    </View>
  );
}

function CartaoCultivo({ c, onExcluir }: { c: CultivoResumo; onExcluir: () => void }) {
  const lucro = c.total_receitas - c.total_despesas;
  const prog = progressoCultivo(c);
  const corProg = prog ? (prog.percentual < 50 ? cores.primaria : prog.percentual < 80 ? cores.alerta : cores.despesa) : '';
  const base = `/cultivos/${c.id}`;
  const ir = (sufixo: string) => router.push(`${base}${sufixo}` as Href);

  return (
    <View style={[styles.card, c.finalizado && styles.cardFinalizado]}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardIcone}>{c.finalizado ? '✅' : '🌱'}</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.tituloLinha}>
            <Text style={styles.cardNome} numberOfLines={1}>
              {c.nome_cultura}
            </Text>
            {c.finalizado && <Text style={styles.badge}>FINALIZADO</Text>}
          </View>
          <Text style={styles.cardSub}>
            📅 {c.ano}   📍 {c.localidade}
          </Text>
          <Text style={styles.cardSub}>
            {c.area_hectares > 0 ? `📏 ${quantidade(c.area_hectares)} ha   ` : ''}
            {c.numero_sacas > 0 ? `🌾 ${quantidade(c.numero_sacas)} sacas` : ''}
          </Text>
        </View>
        <Pressable style={styles.editar} onPress={() => ir('/editar')} accessibilityLabel="Editar cultivo">
          <Text>✏️</Text>
        </Pressable>
      </View>

      <View style={styles.financeiro}>
        <Valor rotulo="💸 Despesas" valor={moeda(c.total_despesas)} cor={cores.despesa} />
        <Valor rotulo="💰 Receitas" valor={moeda(c.total_receitas)} cor={cores.receita} />
        <Valor
          rotulo="📊 Resultado"
          valor={`${lucro >= 0 ? '+' : ''}${moeda(lucro)}`}
          cor={lucro >= 0 ? cores.receita : cores.despesa}
        />
      </View>

      {c.total_chuva > 0 && (
        <Text style={styles.chuva}>🌧️ {quantidade(Number(c.total_chuva.toFixed(1)))} mm acumulados</Text>
      )}

      {prog && (
        <View style={{ marginTop: 8 }}>
          <View style={styles.progTopo}>
            <Text style={styles.progTexto}>
              🗓️ Dia {prog.dias} de {prog.ciclo}
            </Text>
            <Text style={[styles.progTexto, { color: corProg }]}>{prog.percentual.toFixed(0)}%</Text>
          </View>
          <View style={styles.progFundo}>
            <View style={[styles.progCheio, { width: `${prog.percentual}%`, backgroundColor: corProg }]} />
          </View>
        </View>
      )}

      <View style={styles.botoes}>
        <Acao texto="💸 Despesas" cor={cores.despesa} fundo={cores.despesaClara} onPress={() => ir('/movimentacoes?tipo=DESPESA')} />
        <Acao texto="💰 Receitas" cor={cores.receita} fundo={cores.receitaClara} onPress={() => ir('/movimentacoes?tipo=RECEITA')} />
        <Acao texto="📊 Relatório" cor={cores.relatorio} fundo={cores.relatorioClara} onPress={() => ir('/relatorio')} />
        <Acao texto="🌧️ Chuvas" cor={cores.chuva} fundo={cores.chuvaClara} onPress={() => ir('/chuvas')} />
        <Acao texto="📸 Fotos" cor={cores.alerta} fundo={cores.alertaClara} onPress={() => ir('/fotos')} />
      </View>

      <BotaoConfirmar
        titulo="🗑️ Excluir cultivo"
        confirmar="Apagar cultivo e todos os lançamentos?"
        pequeno
        onConfirmar={onExcluir}
        style={{ marginTop: 10, alignSelf: 'flex-end' }}
      />
    </View>
  );
}

function Valor({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.valorRotulo}>{rotulo}</Text>
      <Text style={[styles.valor, { color: cor }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </View>
  );
}

function Acao({ texto, cor, fundo, onPress }: { texto: string; cor: string; fundo: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.acao, { backgroundColor: fundo, borderColor: cor }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.acaoTexto, { color: cor }]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, paddingBottom: 96, maxWidth: 900, width: '100%', alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 10,
    alignItems: 'center',
  },
  statValor: { fontSize: 20, fontWeight: '800' },
  statRotulo: { fontSize: 11, color: cores.textoSecundario },
  busca: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
    color: cores.texto,
  },
  contagem: { color: cores.textoSecundario, marginVertical: 10, fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 14,
    marginBottom: 12,
  },
  cardFinalizado: { backgroundColor: '#fafcf9' },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcone: { fontSize: 26 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardNome: { fontSize: 18, fontWeight: '800', color: cores.texto, flexShrink: 1 },
  badge: {
    backgroundColor: cores.primaria,
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardSub: { color: cores.textoSecundario, fontSize: 13, marginTop: 2 },
  editar: { padding: 8, backgroundColor: cores.primariaClara, borderRadius: 8 },
  financeiro: {
    flexDirection: 'row',
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eef2ec',
  },
  valorRotulo: { fontSize: 11, color: cores.textoSecundario },
  valor: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  chuva: { color: cores.chuva, fontWeight: '700', marginTop: 8, fontSize: 13 },
  progTopo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progTexto: { fontSize: 12, fontWeight: '700', color: cores.textoSecundario },
  progFundo: { height: 6, backgroundColor: '#eef2ec', borderRadius: 3, overflow: 'hidden' },
  progCheio: { height: '100%', borderRadius: 3 },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  acao: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  acaoTexto: { fontSize: 13, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: cores.primaria,
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
