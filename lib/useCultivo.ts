import { getCultivo, type Cultivo } from '@/lib/cultivos';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

// Cultivo da rota /cultivos/[id]/..., relido a cada vez que a tela ganha foco
// (editou e voltou, ou mudou em outro aparelho).
export function useCultivo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cultivoId = id ?? '';
  const [cultivo, setCultivo] = useState<Cultivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useRecarregarAoFocar(() => {
    if (!cultivoId) {
      setErro('Cultivo inválido.');
      return;
    }
    getCultivo(cultivoId)
      .then((c) => {
        setCultivo(c);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o cultivo.'));
  });

  return { cultivoId, cultivo, erro };
}
