import { ouvirSync } from '@/lib/syncPonte';
import { useEffect, useState } from 'react';

// Número que muda toda vez que a sincronização traz algo novo do servidor.
//
// As telas passam este valor para useRecarregarAoFocar, junto com a fazenda.
// Sem ele, quem abre o app vê a cópia local de antes: os dados chegam segundos
// depois, e a tela já foi desenhada — só apareceriam ao trocar de aba e voltar.
//
// Na web sempre vale 0: não existe cópia local, e cada tela já lê do Supabase.
export function useVersaoDados(): number {
  const [versao, setVersao] = useState(0);
  useEffect(() => ouvirSync((_estado, _pendentes, v) => setVersao(v)), []);
  return versao;
}
