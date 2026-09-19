import { Botao, Cartao } from '@/components/ui';
import { alertaClima, buscarClima, descricaoClima, iconeClima, type Clima } from '@/lib/clima';
import { listCultivosResumo, type CultivoResumo } from '@/lib/cultivos';
import { moeda } from '@/lib/formatar';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return DIAS[new Date(a, m - 1, d).getDay()];
}

// Painel inicial: clima da posição atual (com alerta de chuva) e um resumo
// dos cultivos em andamento.
export default function InicioScreen() {
  const [clima, setClima] = useState<Clima | null>(null);
  const [climaCarregando, setClimaCarregando] = useState(true);
  const [cultivos, setCultivos] = useState<CultivoResumo[] | null>(null);

  useEffect(() => {
    buscarClima()
      .then(setClima)
      .catch(() => setClima(null))
      .finally(() => setClimaCarregando(false));
  }, []);

  useRecarregarAoFocar(() => {
    listCultivosResumo()
      .then(setCultivos)
      .catch(() => setCultivos([]));
  });

  const alerta = clima ? alertaClima(clima) : null;
  const ativos = (cultivos ?? []).filter((c) => !c.finalizado);
  const despesas = ativos.reduce((s, c) => s + c.total_despesas, 0);
  const receitas = ativos.reduce((s, c) => s + c.total_receitas, 0);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {alerta && (
        <View
          style={[
            styles.alerta,
            alerta.urgente
              ? { backgroundColor: cores.despesaClara, borderLeftColor: cores.despesa }
              : { backgroundColor: cores.chuvaClara, borderLeftColor: cores.chuva },
          ]}
        >
          <Text style={styles.alertaTitulo}>{alerta.titulo}</Text>
          <Text style={styles.alertaMsg}>{alerta.mensagem}</Text>
        </View>
      )}

      <Cartao>
        {climaCarregando ? (
          <ActivityIndicator color={cores.primaria} />
        ) : clima ? (
          <View style={styles.climaLinha}>
            <View style={styles.climaAtual}>
              <Text style={styles.climaIcone}>{iconeClima(clima.codigo)}</Text>
              <View>
                {!!clima.cidade && <Text style={styles.climaCidade}>{clima.cidade}</Text>}
                <Text style={styles.climaTemp}>{Math.round(clima.temperatura)}°C</Text>
                <Text style={styles.climaDesc}>{descricaoClima(clima.codigo)}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {clima.dias.map((d) => (
                <View key={d.data} style={styles.previsao}>
                  <Text style={styles.previsaoDia}>{diaDaSemana(d.data)}</Text>
                  <Text style={styles.previsaoIcone}>{iconeClima(d.codigo)}</Text>
                  <Text style={styles.previsaoMax}>{Math.round(d.max)}°</Text>
                  <Text style={styles.previsaoMin}>{Math.round(d.min)}°</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Text style={styles.climaErro}>
            Clima indisponível. Permita o acesso à localização para ver a previsão.
          </Text>
        )}
      </Cartao>

      <Cartao>
        <Text style={styles.secao}>🌱 Safra em andamento</Text>
        {cultivos === null ? (
          <ActivityIndicator color={cores.primaria} />
        ) : (
          <>
            <View style={styles.resumoLinha}>
              <Resumo rotulo="Cultivos ativos" valor={String(ativos.length)} cor={cores.primaria} />
              <Resumo rotulo="Despesas" valor={moeda(despesas)} cor={cores.despesa} />
              <Resumo rotulo="Receitas" valor={moeda(receitas)} cor={cores.receita} />
            </View>
            {cultivos.length === 0 && (
              <Text style={styles.dica}>Você ainda não tem cultivos. Comece cadastrando o primeiro.</Text>
            )}
          </>
        )}
      </Cartao>

      <View style={styles.acoes}>
        <Botao titulo="🌱 Ver meus cultivos" onPress={() => router.push('/cultivos')} />
        <Botao titulo="+ Novo cultivo" contorno onPress={() => router.push('/cultivos/novo')} />
        <Botao titulo="💹 Lucro dos cultivos" contorno onPress={() => router.push('/lucro')} />
        <Botao titulo="📍 Mapa satélite da safra" contorno onPress={() => router.push('/mapa')} />
      </View>
    </ScrollView>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <View style={styles.resumoItem}>
      <Text style={[styles.resumoValor, { color: cor }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  alerta: { borderLeftWidth: 4, borderRadius: 10, padding: 12, marginBottom: 12 },
  alertaTitulo: { fontWeight: '800', color: cores.texto, marginBottom: 2 },
  alertaMsg: { color: cores.textoSecundario },
  climaLinha: { flexDirection: 'row', alignItems: 'center' },
  climaAtual: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 14,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: cores.borda,
  },
  climaIcone: { fontSize: 38, marginRight: 10 },
  climaCidade: { fontSize: 12, fontWeight: '700', color: cores.primaria },
  climaTemp: { fontSize: 24, fontWeight: '800', color: cores.texto },
  climaDesc: { fontSize: 13, color: cores.textoSecundario },
  climaErro: { color: cores.textoSecundario, textAlign: 'center' },
  previsao: { alignItems: 'center', marginHorizontal: 8, minWidth: 38 },
  previsaoDia: { fontSize: 11, fontWeight: '700', color: cores.textoSecundario, textTransform: 'uppercase' },
  previsaoIcone: { fontSize: 20, marginVertical: 2 },
  previsaoMax: { fontSize: 14, fontWeight: '700', color: cores.texto },
  previsaoMin: { fontSize: 12, color: cores.textoSecundario },
  secao: { fontSize: 16, fontWeight: '800', color: cores.texto, marginBottom: 12 },
  resumoLinha: { flexDirection: 'row', gap: 8 },
  resumoItem: { flex: 1, backgroundColor: cores.fundo, borderRadius: 10, padding: 10, alignItems: 'center' },
  resumoValor: { fontSize: 16, fontWeight: '800' },
  resumoRotulo: { fontSize: 12, color: cores.textoSecundario, marginTop: 2 },
  dica: { color: cores.textoSecundario, marginTop: 12, textAlign: 'center' },
  acoes: { gap: 10, marginTop: 4 },
});
