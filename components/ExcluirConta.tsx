import { Botao, Campo, Cartao, Mensagem } from '@/components/ui';
import { excluirMinhaConta, resumoExclusao, type ResumoExclusao } from '@/lib/conta';
import { cores } from '@/lib/tema';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

// "Excluir minha conta", no fim do Perfil.
//
// Pede a palavra EXCLUIR digitada, e não só um segundo toque como as outras
// exclusões do app: aqui não há como desfazer, e o estrago alcança a safra
// inteira. Antes de qualquer coisa, a tela diz o que vai sumir e o que fica
// com os sócios.
export function ExcluirConta() {
  const [aberto, setAberto] = useState(false);
  const [resumo, setResumo] = useState<ResumoExclusao | null>(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    resumoExclusao()
      .then(setResumo)
      .catch(() => setResumo(null));
  }, [aberto]);

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    try {
      await excluirMinhaConta();
      router.replace('/login');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir a conta.');
      setExcluindo(false);
    }
  }

  if (!aberto) {
    return (
      <Cartao>
        <Text style={styles.titulo}>Excluir minha conta</Text>
        <Text style={styles.texto}>
          Apaga sua conta e os dados das fazendas em que você está sozinho. Não tem volta.
        </Text>
        <Botao
          titulo="Excluir minha conta"
          contorno
          cor={cores.despesa}
          onPress={() => setAberto(true)}
          style={{ marginTop: 10 }}
        />
      </Cartao>
    );
  }

  return (
    <Cartao style={{ borderColor: cores.despesa }}>
      <Text style={styles.titulo}>Excluir minha conta</Text>

      {resumo && (
        <Text style={styles.texto}>
          {resumo.fazendas_apagadas > 0
            ? `Vão ser apagadas ${resumo.fazendas_apagadas} fazenda(s) com ${resumo.cultivos_apagados} cultivo(s), incluindo despesas, receitas, chuvas e fotos. `
            : 'Nenhuma fazenda será apagada. '}
          {resumo.fazendas_que_ficam > 0
            ? `Em ${resumo.fazendas_que_ficam} fazenda(s) há outras pessoas: elas continuam com os dados, e você apenas sai.`
            : ''}
        </Text>
      )}

      <Text style={[styles.texto, styles.aviso]}>
        Isso não pode ser desfeito. Se quiser guardar os números, gere antes os relatórios em PDF.
      </Text>

      <Mensagem texto={erro} />

      <Campo
        label='Digite EXCLUIR para confirmar'
        placeholder="EXCLUIR"
        autoCapitalize="characters"
        autoCorrect={false}
        value={confirmacao}
        onChangeText={setConfirmacao}
      />

      <Botao
        titulo="Excluir definitivamente"
        cor={cores.despesa}
        carregando={excluindo}
        desabilitado={confirmacao.trim().toUpperCase() !== 'EXCLUIR'}
        onPress={excluir}
      />
      <Botao
        titulo="Cancelar"
        contorno
        cor={cores.textoSecundario}
        onPress={() => {
          setAberto(false);
          setConfirmacao('');
          setErro(null);
        }}
        style={{ marginTop: 10 }}
      />
    </Cartao>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: 16, fontWeight: '800', color: cores.despesa, marginBottom: 6 },
  texto: { color: cores.textoSecundario, fontSize: 13, lineHeight: 19 },
  aviso: { marginTop: 8, fontWeight: '700', color: cores.texto },
});
