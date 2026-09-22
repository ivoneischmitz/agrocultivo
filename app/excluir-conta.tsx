import { Botao } from '@/components/ui';
import { ExcluirConta } from '@/components/ExcluirConta';
import { useAuth } from '@/contexts/AuthContext';
import { cores } from '@/lib/tema';
import { router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Página pública de exclusão de conta.
//
// A Play Store exige, além do caminho dentro do app, um endereço na web onde
// qualquer pessoa possa pedir a exclusão sem instalar nada — e é este link que
// se informa no cadastro do aplicativo. Por isso a rota fica fora do grupo
// (app): tem que abrir sem sessão.
export default function ExcluirContaScreen() {
  const { session, isLoading } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Excluir conta do Agro Cultivo</Text>

        <Text style={styles.texto}>
          Você pode apagar sua conta e seus dados a qualquer momento, sem precisar pedir para
          ninguém.
        </Text>

        <Text style={styles.subtitulo}>O que é apagado</Text>
        <Text style={styles.texto}>
          A conta de acesso, seu perfil e os dados das fazendas em que você é a única pessoa:
          cultivos, despesas, receitas, registros de chuva, fotos e anexos.
        </Text>

        <Text style={styles.subtitulo}>O que permanece</Text>
        <Text style={styles.texto}>
          Fazendas compartilhadas com outras pessoas continuam existindo, porque os lançamentos
          também são delas. Nesse caso, você deixa de participar e perde o acesso.
        </Text>

        <Text style={styles.subtitulo}>Como fazer</Text>
        <Text style={styles.texto}>
          Entre na sua conta e use o botão abaixo, ou faça pelo aplicativo em Perfil → Excluir minha
          conta. A exclusão é imediata e não pode ser desfeita.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : session ? (
          <View style={{ marginTop: 16 }}>
            <ExcluirConta />
          </View>
        ) : (
          <Botao
            titulo="Entrar para excluir minha conta"
            onPress={() => router.replace('/login')}
            style={{ marginTop: 16 }}
          />
        )}

        <Text style={styles.subtitulo}>Precisa de ajuda?</Text>
        <Text style={styles.texto}>
          Se você não consegue entrar na conta, escreva para{' '}
          <Pressable onPress={() => Linking.openURL('mailto:ivonei.ti@gmail.com')}>
            <Text style={styles.link}>ivonei.ti@gmail.com</Text>
          </Pressable>{' '}
          do endereço cadastrado, pedindo a exclusão. O pedido é atendido em até 30 dias.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, backgroundColor: cores.fundo, flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  titulo: { fontSize: 22, fontWeight: '800', color: cores.primariaEscura, marginBottom: 12 },
  subtitulo: { fontSize: 15, fontWeight: '700', color: cores.texto, marginTop: 18, marginBottom: 4 },
  texto: { color: cores.textoSecundario, fontSize: 14, lineHeight: 21 },
  link: { color: cores.primaria, fontWeight: '600', fontSize: 14 },
});
