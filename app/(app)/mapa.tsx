import { MapaLeaflet, type MapaLeafletRef } from '@/components/MapaLeaflet';
import { Carregando, Mensagem } from '@/components/ui';
import { posicaoAtual } from '@/lib/clima';
import { listCultivosResumo, type CultivoResumo } from '@/lib/cultivos';
import type { Marcador } from '@/lib/mapaHtml';
import { useFazenda } from '@/contexts/FazendaContext';
import { useVersaoDados } from '@/lib/useVersaoDados';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Mapa satélite com os cultivos em andamento. Era recurso Pro no app antigo.
export default function MapaScreen() {
  const mapa = useRef<MapaLeafletRef>(null);
  const [cultivos, setCultivos] = useState<CultivoResumo[] | null>(null);
  const { fazendaId } = useFazenda();
  // Muda quando a sincronização traz algo: faz a tela reler sem trocar de aba.
  const versao = useVersaoDados();
  const [erro, setErro] = useState<string | null>(null);

  useRecarregarAoFocar(() => {
    if (!fazendaId) return;
    listCultivosResumo(fazendaId)
      .then((l) => setCultivos(l.filter((c) => !c.finalizado)))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, `${fazendaId}:${versao}`);

  // A identidade do array decide quando o mapa recarrega (ver MapaLeaflet),
  // então só muda quando os pontos mudam de verdade.
  const chave = (cultivos ?? []).map((c) => `${c.id}:${c.latitude}:${c.longitude}`).join('|');
  const marcadores = useMemo<Marcador[]>(
    () =>
      (cultivos ?? [])
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          id: c.id,
          latitude: c.latitude!,
          longitude: c.longitude!,
          titulo: c.nome_cultura,
          subtitulo: `📅 ${c.ano}${c.localidade ? ` · 📍 ${c.localidade}` : ''}`,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave],
  );

  if (cultivos === null) return erro ? <Mensagem texto={erro} /> : <Carregando />;

  const centro = marcadores[0] ?? { latitude: -24.72, longitude: -53.74 };

  async function irParaMim() {
    setErro(null);
    try {
      const p = await posicaoAtual();
      if (!p) return setErro('Permita o acesso à localização.');
      mapa.current?.focar(p.latitude, p.longitude, 16);
    } catch {
      setErro('Não foi possível obter sua localização.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <MapaLeaflet
        ref={mapa}
        style={{ flex: 1 }}
        centro={centro}
        zoom={marcadores.length > 0 ? 14 : 8}
        marcadores={marcadores}
      />
      <Pressable style={styles.gps} onPress={irParaMim} accessibilityLabel="Ir para minha localização">
        <Text style={{ fontSize: 20 }}>📍</Text>
      </Pressable>
      <View style={styles.legenda}>
        <Mensagem texto={erro} />
        <Text style={styles.legendaTitulo}>🌾 Cultivos ativos</Text>
        <ScrollView style={{ maxHeight: 150 }}>
          {cultivos.length === 0 && <Text style={styles.vazio}>Nenhum cultivo ativo</Text>}
          {cultivos.map((c) => {
            const tem = c.latitude != null && c.longitude != null;
            return (
              <Pressable
                key={c.id}
                style={styles.item}
                onPress={() => (tem ? mapa.current?.focar(c.latitude!, c.longitude!, 16) : setErro(`"${c.nome_cultura}" não tem coordenadas. Edite o cultivo para adicionar.`))}
              >
                <View style={[styles.ponto, { backgroundColor: tem ? '#ff9800' : '#999' }]} />
                <Text style={styles.itemTexto} numberOfLines={1}>
                  {c.nome_cultura} - {c.ano}
                  {!tem ? ' (sem GPS)' : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gps: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#fff',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  legenda: { backgroundColor: '#fff', padding: 12, borderTopWidth: 1, borderTopColor: cores.borda },
  legendaTitulo: { fontWeight: '800', color: cores.texto, marginBottom: 6 },
  vazio: { color: cores.textoSecundario },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  ponto: { width: 10, height: 10, borderRadius: 5 },
  itemTexto: { color: cores.texto, flex: 1 },
});
