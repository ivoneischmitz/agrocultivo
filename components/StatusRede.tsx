import { ouvirSync, type EstadoSync } from '@/lib/syncPonte';
import { cores } from '@/lib/tema';
import { useNetworkState } from 'expo-network';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Bolinha de "tem internet / sem internet" na barra de cima, com o que ainda
// não subiu.
//
// No celular, ficar sem sinal não impede de lançar: o dado fica guardado no
// aparelho e sobe depois (ver lib/sync.native.ts), e é isso que o contador
// "N a enviar" mostra. Na web não há cópia local, então sem internet as telas
// realmente não carregam — e o aviso explica por quê.
//
// isInternetReachable é o que interessa: dá para estar num wi-fi que não leva
// a lugar nenhum. Ele começa indefinido enquanto o aparelho verifica, e nesse
// meio tempo vale o isConnected. Na web vem do navigator.onLine, que só sabe
// se há rede, não se ela funciona.
export function StatusRede() {
  const rede = useNetworkState();
  const online = rede.isInternetReachable ?? rede.isConnected ?? true;
  const [sync, setSync] = useState<{ estado: EstadoSync; pendentes: number }>({
    estado: 'parado',
    pendentes: 0,
  });

  // Só o celular tem o que sincronizar; na web ouvirSync não avisa nada.
  useEffect(() => ouvirSync((estado, pendentes) => setSync({ estado, pendentes })), []);

  const texto = !online
    ? sync.pendentes > 0
      ? `Offline · ${sync.pendentes}`
      : 'Offline'
    : sync.estado === 'sincronizando'
      ? 'Enviando...'
      : sync.pendentes > 0
        ? `${sync.pendentes} a enviar`
        : 'Online';

  return (
    <View
      style={[styles.caixa, online ? styles.online : styles.offline]}
      accessibilityRole="text"
      accessibilityLabel={
        online
          ? sync.pendentes > 0
            ? `Conectado. ${sync.pendentes} lançamento(s) ainda não enviado(s)`
            : 'Conectado à internet'
          : sync.pendentes > 0
            ? `Sem internet. ${sync.pendentes} lançamento(s) guardado(s) no aparelho`
            : 'Sem internet'
      }
    >
      <View style={[styles.bolinha, { backgroundColor: online ? '#7ddb7d' : '#ffb4a2' }]} />
      <Text style={styles.texto}>{texto}</Text>
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
