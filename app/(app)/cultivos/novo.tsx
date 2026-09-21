import { CultivoForm } from '@/components/CultivoForm';
import { Carregando, Mensagem } from '@/components/ui';
import { useFazenda } from '@/contexts/FazendaContext';
import { createCultivo } from '@/lib/cultivos';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function NovoCultivoScreen() {
  const { fazendaId, carregando } = useFazenda();

  if (carregando) return <Carregando />;
  if (!fazendaId) {
    return (
      <View style={{ padding: 16 }}>
        <Mensagem texto="Nenhuma fazenda encontrada nesta conta." />
      </View>
    );
  }

  return (
    <CultivoForm
      inicial={null}
      onCancelar={() => router.back()}
      onSalvar={async (input) => {
        await createCultivo({ ...input, fazenda_id: fazendaId });
        router.back();
      }}
    />
  );
}
