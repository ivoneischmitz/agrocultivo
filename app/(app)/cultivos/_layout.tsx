import { cores } from '@/lib/tema';
import { Stack } from 'expo-router';

// Pilha dentro da aba Cultivos: lista -> cadastro, despesas, relatório...
// Cada tela recebe o id do cultivo na URL e o carrega sozinha, então um F5 na
// web ou um link direto (/cultivos/12/relatorio) funcionam. O app antigo
// passava o objeto inteiro por parâmetro de navegação, o que não sobrevive a
// um recarregamento de página.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function CultivosLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: cores.primariaEscura,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Cultivos' }} />
      <Stack.Screen name="novo" options={{ title: 'Novo cultivo' }} />
      <Stack.Screen name="[id]/editar" options={{ title: 'Editar cultivo' }} />
      <Stack.Screen name="[id]/movimentacoes" options={{ title: 'Movimentações' }} />
      <Stack.Screen name="[id]/movimentacao" options={{ title: 'Movimentação' }} />
      <Stack.Screen name="[id]/relatorio" options={{ title: 'Relatório' }} />
      <Stack.Screen name="[id]/chuvas" options={{ title: 'Pluviômetro' }} />
      <Stack.Screen name="[id]/calculadora" options={{ title: 'Calculadora de sementes' }} />
      <Stack.Screen name="[id]/fotos" options={{ title: 'Histórico visual' }} />
    </Stack>
  );
}
