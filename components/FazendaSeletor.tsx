import { useFazenda } from '@/contexts/FazendaContext';
import { cores } from '@/lib/tema';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

// Qual fazenda está aberta, na barra de cima.
//
// Só aparece para quem participa de mais de uma — no uso comum, de quem tem só
// a sua, seria um botão que não faz nada. A lista abre num Modal, como o menu
// de Configurações do Força de Vendas, para ficar por cima das abas.
export function FazendaSeletor() {
  const { fazenda, fazendas, trocar } = useFazenda();
  const [aberto, setAberto] = useState(false);

  if (fazendas.length < 2 || !fazenda) return null;

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`Fazenda ${fazenda.nome}. Trocar de fazenda`}
        style={styles.botao}
      >
        <Text style={styles.texto} numberOfLines={1}>
          {fazenda.nome} ▾
        </Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.lista} onPress={() => {}}>
            <Text style={styles.titulo}>Trocar de fazenda</Text>
            {fazendas.map((f) => {
              const atual = f.id === fazenda.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    trocar(f.id);
                    setAberto(false);
                  }}
                  style={[styles.item, atual && styles.itemAtual]}
                >
                  <Text style={[styles.itemTexto, atual && styles.itemTextoAtual]}>
                    {atual ? '✓ ' : ''}
                    {f.nome}
                  </Text>
                  {!!f.municipio && (
                    <Text style={styles.itemSub}>
                      {f.municipio}
                      {f.uf ? ` - ${f.uf}` : ''}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  botao: {
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  texto: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  lista: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  titulo: { fontWeight: '800', color: cores.texto, padding: 10 },
  item: { padding: 12, borderRadius: 8 },
  itemAtual: { backgroundColor: cores.primariaClara },
  itemTexto: { fontSize: 15, color: cores.texto },
  itemTextoAtual: { fontWeight: '700', color: cores.primariaEscura },
  itemSub: { fontSize: 12, color: cores.textoSecundario, marginTop: 2 },
});
