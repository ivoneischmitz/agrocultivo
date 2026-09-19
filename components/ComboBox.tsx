import { normalize } from '@/lib/normalize';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type ComboBoxOpcao = {
  id: string;
  label: string;
  sublabel?: string;
};

type Props = {
  label: string;
  placeholder?: string;
  opcoes: ComboBoxOpcao[];
  selecionadoId: string | null;
  onSelect: (opcao: ComboBoxOpcao | null) => void;
  vazioTexto?: string;
};

// Type-to-filter picker for choosing an existing record (a cliente, a produto)
// by id. Same shape as the categoria dropdown inside ProdutoFormModal, but
// that one edits free text while this one selects an entity — which is why
// it's a separate component rather than a generalisation of it. Reuse this for
// new "pick a record" fields instead of pasting a third dropdown.
//
// Deliberately not a Modal: it renders inline under its input, so it works
// inside the forms that already live in a ScrollView.
export function ComboBox({
  label,
  placeholder,
  opcoes,
  selecionadoId,
  onSelect,
  vazioTexto = 'Nenhum resultado.',
}: Props) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);

  const selecionado = opcoes.find((o) => o.id === selecionadoId) ?? null;

  const filtradas = useMemo(() => {
    const query = normalize(busca.trim());
    if (!query) return opcoes;
    return opcoes.filter(
      (o) => normalize(o.label).includes(query) || normalize(o.sublabel ?? '').includes(query),
    );
  }, [opcoes, busca]);

  // While closed the input shows the chosen record; opening it hands the field
  // back to the search text so you can type over the selection.
  const valorDoInput = aberto ? busca : (selecionado?.label ?? '');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={valorDoInput}
          placeholder={placeholder}
          onFocus={() => setAberto(true)}
          onChangeText={(text) => {
            setBusca(text);
            setAberto(true);
          }}
        />
        <Pressable
          style={styles.toggle}
          onPress={() => {
            setBusca('');
            setAberto((prev) => !prev);
          }}
          accessibilityRole="button"
          accessibilityLabel={aberto ? 'Fechar lista' : 'Abrir lista'}
        >
          <Text style={styles.toggleText}>{aberto ? '▲' : '▼'}</Text>
        </Pressable>
      </View>

      {selecionado && !aberto && selecionado.sublabel ? (
        <Text style={styles.sublabel}>{selecionado.sublabel}</Text>
      ) : null}

      {aberto && (
        <View style={styles.dropdown}>
          <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtradas.length === 0 ? (
              <Text style={styles.dropdownEmpty}>{vazioTexto}</Text>
            ) : (
              filtradas.map((opcao) => (
                <Pressable
                  key={opcao.id}
                  style={styles.dropdownItem}
                  onPress={() => {
                    onSelect(opcao);
                    setBusca('');
                    setAberto(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{opcao.label}</Text>
                  {opcao.sublabel ? (
                    <Text style={styles.dropdownItemSub}>{opcao.sublabel}</Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {selecionado && !aberto && (
        <Pressable onPress={() => onSelect(null)} style={styles.limpar}>
          <Text style={styles.limparText}>Limpar</Text>
        </Pressable>
      )}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  input: {
    flex: 1,
    padding: 10,
    fontSize: 16,
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleText: {
    fontSize: 12,
    color: '#666',
  },
  sublabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dropdownItemText: {
    fontSize: 15,
  },
  dropdownItemSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: 12,
    fontSize: 13,
    color: '#888',
  },
  limpar: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  limparText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
});
