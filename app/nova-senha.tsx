import { Botao, Campo, Mensagem } from '@/components/ui';
import { traduzirErro, useAuth } from '@/contexts/AuthContext';
import { cores } from '@/lib/tema';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// Destino do link de "Esqueci minha senha". O Supabase devolve o token na URL,
// o cliente (detectSessionInUrl) o troca por uma sessão, e aqui a pessoa define
// a senha nova. É também como entra pela primeira vez quem veio do app antigo
// e foi importado sem senha.
export default function NovaSenhaScreen() {
  const { session, isLoading, updatePassword } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // Link vencido ou aberto sem token: volta para o login pedir outro.
  if (!session) return <Redirect href="/login" />;

  async function salvar() {
    setErro(null);
    if (senha.length < 6) return setErro('A senha deve ter no mínimo 6 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    setEnviando(true);
    try {
      await updatePassword(senha);
      router.replace('/');
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.titulo}>Criar nova senha</Text>
        <Text style={styles.sub}>{session.user.email}</Text>
        <Mensagem texto={erro} />
        <Campo label="Nova senha" secureTextEntry value={senha} onChangeText={setSenha} />
        <Campo
          label="Repita a senha"
          secureTextEntry
          value={confirmacao}
          onChangeText={setConfirmacao}
          onSubmitEditing={salvar}
        />
        <Botao titulo="Salvar senha" onPress={salvar} carregando={enviando} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.primariaEscura, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, alignSelf: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto, textAlign: 'center' },
  sub: { color: cores.textoSecundario, textAlign: 'center', marginTop: 4, marginBottom: 16 },
});
