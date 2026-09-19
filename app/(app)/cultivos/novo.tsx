import { CultivoForm } from '@/components/CultivoForm';
import { createCultivo } from '@/lib/cultivos';
import { router } from 'expo-router';

export default function NovoCultivoScreen() {
  return (
    <CultivoForm
      inicial={null}
      onCancelar={() => router.back()}
      onSalvar={async (input) => {
        await createCultivo(input);
        router.back();
      }}
    />
  );
}
