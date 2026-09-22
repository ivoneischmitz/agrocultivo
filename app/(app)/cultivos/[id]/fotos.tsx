import { Botao, BotaoConfirmar, Carregando, Mensagem, Vazio } from '@/components/ui';
import { useFazenda } from '@/contexts/FazendaContext';
import { deleteFoto, enviarFoto, listFotos, type Foto } from '@/lib/fotos';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import { usePaddingInferior } from '@/lib/usePaddingInferior';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

// Histórico visual do cultivo. No app antigo existia a tela mas nenhum botão
// levava até ela; aqui o cartão do cultivo tem "📸 Fotos".
export default function FotosScreen() {
  const { cultivoId, cultivo } = useCultivo();
  const { fazendaId } = useFazenda();
  const { width } = useWindowDimensions();
  const padding = usePaddingInferior(16);
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberta, setAberta] = useState<Foto | null>(null);

  const colunas = width > 900 ? 5 : width > 600 ? 4 : 3;
  const lado = (Math.min(width, 900) - 32 - (colunas - 1) * 6) / colunas;

  function carregar() {
    listFotos(cultivoId)
      .then(setFotos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar fotos.'));
  }
  useRecarregarAoFocar(carregar);

  async function adicionar(origem: 'camera' | 'galeria') {
    setErro(null);
    const perm =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setErro('Permissão negada para acessar ' + (origem === 'camera' ? 'a câmera.' : 'a galeria.'));

    const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.7, allowsEditing: true, aspect: [4, 3], mediaTypes: ['images'] };
    const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (r.canceled) return;

    setEnviando(true);
    try {
      if (!fazendaId) throw new Error('Fazenda não carregada.');
      await enviarFoto(fazendaId, cultivoId, r.assets[0].uri, r.assets[0].mimeType);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(f: Foto) {
    try {
      await deleteFoto(f);
      setAberta(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
    }
  }

  if (fotos === null && !erro) return <Carregando />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={colunas}
        data={fotos ?? []}
        numColumns={colunas}
        keyExtractor={(f) => String(f.id)}
        contentContainerStyle={styles.lista}
        columnWrapperStyle={{ gap: 6 }}
        ListHeaderComponent={
          <View>
            {cultivo && <Text style={styles.sub}>{cultivo.nome_cultura} · {cultivo.ano}</Text>}
            <Mensagem texto={erro} />
          </View>
        }
        ListEmptyComponent={
          <Vazio icone="🖼️" titulo="Nenhuma foto registrada" subtitulo="Acompanhe o crescimento da lavoura com fotos periódicas." />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setAberta(item)} style={{ marginBottom: 6 }}>
            <Image source={{ uri: item.url }} style={{ width: lado, height: lado, borderRadius: 6, backgroundColor: '#e0e0e0' }} />
            {item.pendente && (
              <Text style={styles.selo} accessibilityLabel="Foto ainda no aparelho, sobe quando houver internet">
                ⏳ no aparelho
              </Text>
            )}
          </Pressable>
        )}
      />

      <View style={[styles.rodape, padding]}>
        {Platform.OS !== 'web' && (
          <Botao titulo="📷 Câmera" carregando={enviando} onPress={() => adicionar('camera')} style={{ flex: 1 }} />
        )}
        <Botao
          titulo={Platform.OS === 'web' ? '🖼️ Enviar foto' : '🖼️ Galeria'}
          cor={cores.chuva}
          carregando={enviando}
          onPress={() => adicionar('galeria')}
          style={{ flex: 1 }}
        />
      </View>

      <Modal visible={!!aberta} animationType="fade" onRequestClose={() => setAberta(null)}>
        {aberta && (
          <View style={styles.modal}>
            <Pressable onPress={() => setAberta(null)} style={styles.fechar}>
              <Text style={styles.fecharTexto}>✕ Fechar</Text>
            </Pressable>
            <Image source={{ uri: aberta.url }} style={{ flex: 1 }} resizeMode="contain" />
            <View style={[styles.modalRodape, padding]}>
              <Text style={styles.data}>📅 {new Date(aberta.data).toLocaleDateString('pt-BR')}</Text>
              <BotaoConfirmar titulo="🗑️ Excluir foto" confirmar="Confirmar exclusão?" pequeno onConfirmar={() => excluir(aberta)} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  sub: { color: cores.textoSecundario, marginBottom: 10 },
  selo: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingVertical: 2,
  },
  rodape: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: cores.borda, backgroundColor: '#fff' },
  modal: { flex: 1, backgroundColor: '#000' },
  fechar: { padding: 16, paddingTop: 40 },
  fecharTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff' },
  data: { color: cores.texto },
});
