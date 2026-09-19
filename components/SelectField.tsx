import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type OpcaoSelect<T extends string> = {
  valor: T;
  label: string;
};

type Props<T extends string> = {
  label: string;
  opcoes: OpcaoSelect<T>[];
  valor: T;
  onChange: (valor: T) => void;
};

// Escolha entre poucas opções fixas e conhecidas.
//
// Não é o ComboBox: aquele é para achar um registro entre muitos, então abre um
// campo de busca — que numa lista de duas opções parece que apagou a escolha.
// Aqui o campo é só um botão que mostra o que está selecionado, e a lista abre
// num Modal, do mesmo jeito que o menu Configurações em AppTopBar.
//
// A escolha é obrigatória: não existe estado vazio, e por isso não há "Limpar".
export function SelectField<T extends string>({ label, opcoes, valor, onChange }: Props<T>) {
  const [aberto, setAberto] = useState(false);

  const selecionada = opcoes.find((opcao) => opcao.valor === valor);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={styles.campo}
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selecionada?.label ?? ''}. Abrir opções`}
      >
        <Text style={styles.campoTexto}>{selecionada?.label ?? ''}</Text>
        <Text style={styles.icone}>▾</Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        {/* Tocar fora fecha sem mudar nada. */}
        <Pressable style={styles.backdrop} onPress={() => setAberto(false)}>
          {/* Engole o toque para clicar dentro da lista não fechá-la. */}
          <Pressable style={styles.lista} onPress={() => {}}>
            {opcoes.map((opcao, index) => (
              <Pressable
                key={opcao.valor}
                style={({ pressed }) => [
                  styles.item,
                  index > 0 && styles.itemDivisor,
                  pressed && styles.itemPressionado,
                ]}
                onPress={() => {
                  onChange(opcao.valor);
                  setAberto(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: opcao.valor === valor }}
              >
                <Text style={[styles.itemTexto, opcao.valor === valor && styles.itemTextoAtivo]}>
                  {opcao.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  campoTexto: {
    fontSize: 16,
  },
  icone: {
    fontSize: 12,
    color: '#666',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lista: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  itemDivisor: {
    borderTopWidth: 1,
    borderTopColor: '#f1f1f1',
  },
  itemPressionado: {
    backgroundColor: '#f5f7ff',
  },
  itemTexto: {
    fontSize: 15,
    color: '#111',
  },
  itemTextoAtivo: {
    color: '#2563eb',
    fontWeight: '700',
  },
});
