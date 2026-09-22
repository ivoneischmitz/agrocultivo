import { useAuth } from '@/contexts/AuthContext';
import {
  aceitarConvite,
  consumirConvitePendente,
  garantirFazenda,
  listMinhasFazendas,
  type Fazenda,
} from '@/lib/fazendas';
import { sincronizar } from '@/lib/syncPonte';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetworkState } from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

// Qual fazenda está aberta no app.
//
// Uma pessoa pode participar de mais de uma (a sua e a de um parceiro, por
// exemplo), então tudo que o app lê e grava passa por aqui. A escolha fica
// guardada no aparelho, por conta, para não voltar à fazenda errada depois de
// trocar de usuário.
type FazendaContextValue = {
  fazendaId: string | null;
  fazenda: Fazenda | null;
  fazendas: Fazenda[];
  carregando: boolean;
  erro: string | null;
  trocar: (id: string) => void;
  recarregar: () => Promise<void>;
};

const FazendaContext = createContext<FazendaContextValue | undefined>(undefined);

const chaveEscolha = (userId: string) => `fazenda-atual:${userId}`;

export function FazendaProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [fazendaId, setFazendaId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!userId) return;
    setErro(null);
    try {
      // Convite aberto antes do login entra agora, antes de montar a lista.
      const convite = await consumirConvitePendente();
      if (convite) {
        try {
          await aceitarConvite(convite);
        } catch (e) {
          setErro(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
        }
      }

      let lista = await listMinhasFazendas();
      if (lista.length === 0) {
        // Conta nova: o banco cria a primeira fazenda.
        await garantirFazenda();
        lista = await listMinhasFazendas();
      }
      setFazendas(lista);

      let escolhida: string | null = null;
      try {
        escolhida = await AsyncStorage.getItem(chaveEscolha(userId));
      } catch {
        // aparelho sem armazenamento disponível: cai na primeira
      }
      const atual = lista.some((f) => f.id === escolhida) ? escolhida : (lista[0]?.id ?? null);
      setFazendaId(atual);
      // No celular, traz o que mudou e sobe o que ficou pendente. Na web não
      // faz nada (lib/syncPonte.ts).
      void sincronizar(atual);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a fazenda.');
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setFazendas([]);
      setFazendaId(null);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    void carregar();
  }, [userId, carregar]);

  // Voltou a internet: sobe o que estava esperando. Sem isso, o lançamento
  // feito na lavoura só subiria quando o app fosse reaberto.
  const rede = useNetworkState();
  const online = rede.isInternetReachable ?? rede.isConnected ?? false;
  useEffect(() => {
    if (online && fazendaId) void sincronizar(fazendaId);
  }, [online, fazendaId]);

  function trocar(id: string) {
    setFazendaId(id);
    void sincronizar(id);
    if (userId) void AsyncStorage.setItem(chaveEscolha(userId), id).catch(() => {});
  }

  return (
    <FazendaContext.Provider
      value={{
        fazendaId,
        fazenda: fazendas.find((f) => f.id === fazendaId) ?? null,
        fazendas,
        carregando,
        erro,
        trocar,
        recarregar: carregar,
      }}
    >
      {children}
    </FazendaContext.Provider>
  );
}

export function useFazenda() {
  const ctx = useContext(FazendaContext);
  if (!ctx) throw new Error('useFazenda precisa estar dentro de FazendaProvider');
  return ctx;
}
