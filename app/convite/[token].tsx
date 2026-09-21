import { Botao, Mensagem } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { aceitarConvite, consumirConvitePendente, guardarConvitePendente } from '@/lib/fazendas';
import { cores } from '@/lib/tema';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// Destino do link de convite.
//
// Fica fora do grupo (app) de propósito: quem chega aqui normalmente ainda não
// tem sessão, e o portão do (app) o mandaria para o login perdendo o código do
// convite pelo caminho. Então a tela guarda o código no aparelho, manda entrar
// e o contexto da fazenda o consome assim que houver sessão.

export default function ConviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, isLoading } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ nome: string; jaEraMembro: boolean } | null>(null);
  // Ref, e não estado: serve só para não tentar entrar duas vezes, e mudar
  // estado dentro do efeito dispararia outra renderização à toa.
  const processando = useRef(false);

  useEffect(() => {
    if (token) void guardarConvitePendente(token);
  }, [token]);

  useEffect(() => {
    if (isLoading || !session || !token || processando.current || pronto) return;
    processando.current = true;
    aceitarConvite(token)
      .then((f) => {
        setPronto({ nome: f.nome, jaEraMembro: f.jaEraMembro });
        void consumirConvitePendente();
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível entrar na fazenda.'));
  }, [isLoading, session, token, pronto]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icone}>🤝</Text>
        <Text style={styles.titulo}>Convite para uma fazenda</Text>

        {!session ? (
          <>
            <Text style={styles.texto}>
              Entre na sua conta (ou crie uma) para aceitar. Assim que você entrar, o convite é
              aplicado sozinho.
            </Text>
            <Botao titulo="Entrar ou criar conta" onPress={() => router.replace('/login')} />
          </>
        ) : !pronto && !erro ? (
          <>
            <ActivityIndicator color={cores.primaria} />
            <Text style={styles.texto}>Entrando na fazenda...</Text>
          </>
        ) : pronto ? (
          <>
            <Text style={styles.texto}>
              {pronto.jaEraMembro
                ? `Você já participa da fazenda "${pronto.nome}".`
                : `Pronto! Agora você participa da fazenda "${pronto.nome}".`}
            </Text>
            <Text style={styles.dica}>
              Se tiver mais de uma fazenda, troque pelo nome dela na barra de cima.
            </Text>
            <Botao titulo="Abrir o app" onPress={() => router.replace('/')} />
          </>
        ) : (
          <>
            <Mensagem texto={erro} />
            <Botao titulo="Abrir o app" contorno onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.primariaEscura, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 12,
  },
  icone: { fontSize: 44, textAlign: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto, textAlign: 'center' },
  texto: { color: cores.textoSecundario, textAlign: 'center' },
  dica: { color: cores.textoSecundario, textAlign: 'center', fontSize: 12 },
});
