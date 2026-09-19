import { CultivoForm } from '@/components/CultivoForm';
import { Carregando, Mensagem } from '@/components/ui';
import { updateCultivo } from '@/lib/cultivos';
import { useCultivo } from '@/lib/useCultivo';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function EditarCultivoScreen() {
  const { cultivo, erro } = useCultivo();

  if (erro) {
    return (
      <View style={{ padding: 16 }}>
        <Mensagem texto={erro} />
      </View>
    );
  }
  if (!cultivo) return <Carregando />;

  return (
    <CultivoForm
      key={cultivo.id}
      inicial={cultivo}
      onCancelar={() => router.back()}
      onSalvar={async (input) => {
        await updateCultivo(cultivo.id, input);
        router.back();
      }}
    />
  );
}
