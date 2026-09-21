import { StatusRede } from '@/components/StatusRede';
import { useAuth } from '@/contexts/AuthContext';
import { cores } from '@/lib/tema';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// "/" é o Início (app/(app)/index.tsx). anchor faz dele a casa do navegador,
// então o voltar do Android sai do app a partir do Início.
export const unstable_settings = {
  anchor: 'index',
};

// Tudo em app/(app)/ exige login, e fica atrás de um menu de abas no topo —
// mesmo desenho do Força de Vendas (Tabs do expo-router com tabBarPosition:
// 'top', sem lib extra, igual em Web, iOS e Android).
export default function AppLayout() {
  const { session, isLoading, isRecovery, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  // Entrou pelo link de recuperação: primeiro a senha nova.
  if (isRecovery) return <Redirect href="/nova-senha" />;

  // paddingBottom tira as telas de baixo da barra de navegação do Android (o
  // SDK 57 desenha de ponta a ponta) — ver o mesmo comentário no Força de
  // Vendas. Os Modal usam lib/usePaddingInferior.ts.
  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: cores.fundo }}>
      <View style={[styles.topo, { paddingTop: insets.top }]}>
        <View style={styles.topoLinha}>
          <Text style={styles.marca}>🌾 Agro Cultivo</Text>
          <View style={styles.direita}>
            <StatusRede />
            <Pressable onPress={() => signOut()} accessibilityRole="button" style={styles.sair}>
              <Text style={styles.sairTexto}>Sair</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <Tabs
        screenOptions={{
          tabBarPosition: 'top',
          headerShown: false,
          tabBarStyle: { backgroundColor: cores.primaria, borderTopWidth: 0 },
          tabBarActiveBackgroundColor: '#43a047',
          tabBarInactiveBackgroundColor: cores.primaria,
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#dcedc8',
          tabBarLabel: ({ color, children }) => (
            <Text style={{ color, fontSize: 13, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
              {children}
            </Text>
          ),
          // Sem ícone: sem isto o Tabs desenha um triângulo no lugar, que na
          // web toma o espaço do nome (ver Força de Vendas).
          tabBarIcon: () => null,
          tabBarIconStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Início' }} />
        {/* popToTopOnBlur: voltar à aba Cultivos cai na lista, não na última
            tela aberta lá dentro. */}
        <Tabs.Screen name="cultivos" options={{ title: 'Cultivos', popToTopOnBlur: true }} />
        <Tabs.Screen name="lucro" options={{ title: 'Lucro' }} />
        <Tabs.Screen name="mapa" options={{ title: 'Mapa' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  topo: { backgroundColor: cores.primariaEscura },
  topoLinha: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  marca: { color: '#fff', fontSize: 18, fontWeight: '800' },
  direita: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sair: { paddingVertical: 8, paddingLeft: 12 },
  sairTexto: { color: '#c8e6c9', fontWeight: '700', fontSize: 15 },
});
