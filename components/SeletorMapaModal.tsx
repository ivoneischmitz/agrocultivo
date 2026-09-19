import { MapaLeaflet, type MapaLeafletRef } from '@/components/MapaLeaflet';
import { Botao } from '@/components/ui';
import { posicaoAtual } from '@/lib/clima';
import { cores } from '@/lib/tema';
import { usePaddingInferior } from '@/lib/usePaddingInferior';
import { useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

type Ponto = { latitude: number; longitude: number };

// Escolher o local do cultivo tocando no mapa.
//
// No app antigo era uma tela da pilha que devolvia o ponto por uma função
// passada em route.params (onSelect). Parâmetro de rota no Expo Router é texto
// na URL, não carrega função — então virou um Modal que devolve por prop.
export function SeletorMapaModal({
  visivel,
  inicial,
  onConfirmar,
  onFechar,
}: {
  visivel: boolean;
  inicial: Ponto;
  onConfirmar: (p: Ponto) => void;
  onFechar: () => void;
}) {
  const padding = usePaddingInferior(12);
  const mapa = useRef<MapaLeafletRef>(null);
  const [ponto, setPonto] = useState<Ponto>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const semMarcadores = useMemo(() => [], []);

  async function minhaLocalizacao() {
    setErro(null);
    try {
      const p = await posicaoAtual();
      if (!p) return setErro('Permita o acesso à localização.');
      mapa.current?.focar(p.latitude, p.longitude, 17);
    } catch {
      setErro('Não foi possível obter sua localização.');
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={styles.container}>
        <Text style={styles.instrucao}>Toque no mapa para apontar o local do cultivo</Text>
        {visivel && (
          <MapaLeaflet
            ref={mapa}
            style={{ flex: 1 }}
            centro={inicial}
            zoom={16}
            marcadores={semMarcadores}
            selecao={inicial}
            onClique={(latitude, longitude) => setPonto({ latitude, longitude })}
          />
        )}
        <View style={[styles.rodape, padding]}>
          <Text style={styles.coords}>
            {ponto.latitude.toFixed(6)}, {ponto.longitude.toFixed(6)}
          </Text>
          {!!erro && <Text style={styles.erro}>{erro}</Text>}
          <Botao titulo="📍 Ir para minha localização" contorno pequeno onPress={minhaLocalizacao} />
          <View style={styles.linha}>
            <Botao titulo="Cancelar" contorno cor={cores.textoSecundario} onPress={onFechar} style={{ flex: 1 }} />
            <Botao titulo="✅ Confirmar" onPress={() => onConfirmar(ponto)} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  instrucao: {
    backgroundColor: cores.primariaEscura,
    color: '#fff',
    textAlign: 'center',
    padding: 12,
    paddingTop: 16,
    fontWeight: '600',
  },
  rodape: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: cores.borda },
  coords: { textAlign: 'center', color: cores.textoSecundario, fontSize: 13 },
  erro: { textAlign: 'center', color: cores.erro },
  linha: { flexDirection: 'row', gap: 10 },
});
