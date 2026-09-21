import { cores } from '@/lib/tema';
import { useNetworkState } from 'expo-network';
import { StyleSheet, Text, View } from 'react-native';

// Bolinha de "tem internet / sem internet" na barra de cima.
//
// Enquanto os dados vivem só no Supabase, ficar sem sinal significa tela vazia
// e lançamento que não salva. Sem este aviso, o produtor no meio da lavoura
// lê isso como defeito do app. Quando a cópia local no celular existir, o
// mesmo indicador passa a dizer "offline, salvando no aparelho".
//
// isInternetReachable é o que interessa: dá para estar num wi-fi que não leva
// a lugar nenhum. Ele começa indefinido enquanto o aparelho verifica, e nesse
// meio tempo vale o isConnected. Na web vem do navigator.onLine, que só sabe
// se há rede, não se ela funciona.
export function StatusRede() {
  const rede = useNetworkState();
  const online = rede.isInternetReachable ?? rede.isConnected ?? true;

  return (
    <View
      style={[styles.caixa, online ? styles.online : styles.offline]}
      accessibilityRole="text"
      accessibilityLabel={online ? 'Conectado à internet' : 'Sem internet'}
    >
      <View style={[styles.bolinha, { backgroundColor: online ? '#7ddb7d' : '#ffb4a2' }]} />
      <Text style={styles.texto}>{online ? 'Online' : 'Offline'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  online: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' },
  offline: { backgroundColor: cores.despesa, borderColor: '#ff8a80' },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  texto: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
