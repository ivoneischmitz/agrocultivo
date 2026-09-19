import { Botao, Campo, Mensagem } from '@/components/ui';
import { traduzirErro, useAuth } from '@/contexts/AuthContext';
import { cores } from '@/lib/tema';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Modo = 'entrar' | 'cadastrar' | 'recuperar';

export default function LoginScreen() {
  const { session, isLoading, isRecovery, signIn, signUp, resetPassword } = useAuth();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  if (session) {
    return <Redirect href={isRecovery ? '/nova-senha' : '/'} />;
  }

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    setAviso(null);
  }

  async function enviar() {
    setErro(null);
    setAviso(null);
    const e = email.trim().toLowerCase();
    if (!e) return setErro('Informe o e-mail.');
    if (modo !== 'recuperar' && !senha) return setErro('Informe a senha.');

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await signIn(e, senha);
      } else if (modo === 'cadastrar') {
        const { precisaConfirmar } = await signUp(e, senha);
        if (precisaConfirmar) {
          setAviso('Conta criada! Abra o e-mail de confirmação que enviamos e depois entre.');
          setModo('entrar');
        }
      } else {
        await resetPassword(e);
        setAviso('Se o e-mail estiver cadastrado, você vai receber um link para criar uma senha nova.');
        setModo('entrar');
      }
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = modo === 'entrar' ? 'Acessar conta' : modo === 'cadastrar' ? 'Criar conta' : 'Recuperar senha';
  const botao = modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Cadastrar' : 'Enviar link';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.icone}>🌾</Text>
          <Text style={styles.app}>Agro Cultivo</Text>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.subtitulo}>
            {modo === 'recuperar'
              ? 'Informe o e-mail da conta. Vale também para quem veio do app antigo e ainda não tem senha aqui.'
              : 'Seus cultivos guardados na nuvem, no celular e no computador.'}
          </Text>

          <Mensagem texto={erro} />
          <Mensagem texto={aviso} tipo="sucesso" />

          <Campo
            label="E-mail"
            placeholder="seu@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {modo !== 'recuperar' && (
            <Campo
              label="Senha"
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              value={senha}
              onChangeText={setSenha}
              onSubmitEditing={enviar}
            />
          )}

          <Botao titulo={botao} onPress={enviar} carregando={enviando} style={{ marginTop: 6 }} />

          <View style={styles.links}>
            {modo !== 'entrar' && (
              <Pressable onPress={() => trocarModo('entrar')}>
                <Text style={styles.link}>Já tenho conta — entrar</Text>
              </Pressable>
            )}
            {modo !== 'cadastrar' && (
              <Pressable onPress={() => trocarModo('cadastrar')}>
                <Text style={styles.link}>Ainda não tem conta? Crie uma aqui</Text>
              </Pressable>
            )}
            {modo !== 'recuperar' && (
              <Pressable onPress={() => trocarModo('recuperar')}>
                <Text style={styles.link}>Esqueci minha senha</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.primariaEscura },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  icone: { fontSize: 48, textAlign: 'center' },
  app: { fontSize: 26, fontWeight: '800', color: cores.primariaEscura, textAlign: 'center' },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.texto, textAlign: 'center', marginTop: 12 },
  subtitulo: { fontSize: 14, color: cores.textoSecundario, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  links: { marginTop: 18, gap: 12, alignItems: 'center' },
  link: { color: cores.primaria, fontWeight: '600', fontSize: 14 },
});
