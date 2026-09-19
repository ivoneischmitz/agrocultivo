import {
  diaDaSemana,
  diasNoMes,
  formatDataBR,
  hojeISO,
  INICIAIS_DIAS_SEMANA,
  isoDe,
  NOMES_MESES,
  parseDataBR,
  partesDaData,
  primeiroDiaDoMes,
  somarMeses,
} from '@/lib/data';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: string; // DD/MM/AAAA, or '' for no date
  onChange: (value: string) => void;
  placeholder?: string;
  // Whether the field may be emptied. Filters allow it (blank = no limit);
  // a required date does not.
  permiteLimpar?: boolean;
};

// Builds the month grid: leading blanks for the weekday the 1st falls on, then
// the days, then trailing blanks so every row has seven cells.
function celulasDoMes(mesVisivel: string): (number | null)[] {
  const primeiro = primeiroDiaDoMes(mesVisivel);
  const { ano, mes } = partesDaData(primeiro);

  const celulas: (number | null)[] = [
    ...Array<null>(diaDaSemana(primeiro)).fill(null),
    ...Array.from({ length: diasNoMes(ano, mes) }, (_, i) => i + 1),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

// A date input that opens a calendar instead of a keyboard. Tapping the field
// opens the month grid; there is no free typing.
//
// The calendar is built here rather than pulled from a library: every date
// picker for react-native is a native dependency, and this project stays
// dependency-light on purpose (the same call that kept material-top-tabs out
// and produced components/Checkbox.tsx and components/ComboBox.tsx). Written
// this way it also behaves identically on Web, iOS and Android.
//
// The value stays a DD/MM/AAAA string so callers keep using parseDataBR and
// nothing downstream had to change.
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  permiteLimpar = true,
}: Props) {
  const [aberto, setAberto] = useState(false);

  const selecionadoISO = parseDataBR(value);
  const hoje = hojeISO();

  // Opening on the selected month, or on the current one when empty.
  const [mesVisivel, setMesVisivel] = useState(
    primeiroDiaDoMes(selecionadoISO ?? hoje),
  );

  const { ano, mes } = partesDaData(mesVisivel);
  const celulas = celulasDoMes(mesVisivel);

  function abrir() {
    // Re-anchor on whatever is in the field now, so reopening doesn't leave
    // you on the month you happened to browse to last time.
    setMesVisivel(primeiroDiaDoMes(parseDataBR(value) ?? hoje));
    setAberto(true);
  }

  function escolher(dia: number) {
    onChange(formatDataBR(isoDe(ano, mes, dia)));
    setAberto(false);
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={styles.campo}
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'nenhuma data'}. Abrir calendário`}
      >
        <Text style={value ? styles.campoTexto : styles.campoPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.icone}>▾</Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        {/* Tapping outside closes without changing the value. */}
        <Pressable style={styles.backdrop} onPress={() => setAberto(false)}>
          {/* Swallows taps so pressing inside the calendar doesn't close it. */}
          <Pressable style={styles.calendario} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <Pressable
                style={styles.navegar}
                onPress={() => setMesVisivel(somarMeses(mesVisivel, -1))}
                accessibilityRole="button"
                accessibilityLabel="Mês anterior"
              >
                <Text style={styles.navegarTexto}>‹</Text>
              </Pressable>

              <Text style={styles.mesAno}>
                {NOMES_MESES[mes - 1]} de {ano}
              </Text>

              <Pressable
                style={styles.navegar}
                onPress={() => setMesVisivel(somarMeses(mesVisivel, 1))}
                accessibilityRole="button"
                accessibilityLabel="Próximo mês"
              >
                <Text style={styles.navegarTexto}>›</Text>
              </Pressable>
            </View>

            <View style={styles.semana}>
              {INICIAIS_DIAS_SEMANA.map((inicial, index) => (
                <Text key={index} style={styles.semanaTexto}>
                  {inicial}
                </Text>
              ))}
            </View>

            {Array.from({ length: celulas.length / 7 }, (_, linha) => (
              <View key={linha} style={styles.linha}>
                {celulas.slice(linha * 7, linha * 7 + 7).map((dia, coluna) => {
                  if (dia === null) return <View key={coluna} style={styles.dia} />;

                  const iso = isoDe(ano, mes, dia);
                  const selecionado = iso === selecionadoISO;
                  const ehHoje = iso === hoje;

                  return (
                    <Pressable
                      key={coluna}
                      style={[
                        styles.dia,
                        ehHoje && !selecionado && styles.diaHoje,
                        selecionado && styles.diaSelecionado,
                      ]}
                      onPress={() => escolher(dia)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selecionado }}
                    >
                      <Text style={[styles.diaTexto, selecionado && styles.diaTextoSelecionado]}>
                        {dia}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={styles.acoes}>
              {permiteLimpar && (
                <Pressable
                  onPress={() => {
                    onChange('');
                    setAberto(false);
                  }}
                >
                  <Text style={styles.acaoSecundaria}>Limpar</Text>
                </Pressable>
              )}
              <View style={styles.acoesDireita}>
                <Pressable onPress={() => setAberto(false)}>
                  <Text style={styles.acaoSecundaria}>Fechar</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onChange(formatDataBR(hoje));
                    setAberto(false);
                  }}
                >
                  <Text style={styles.acaoPrincipal}>Hoje</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    // Matches the height of the TextInputs beside it.
    paddingVertical: 12,
  },
  campoTexto: {
    fontSize: 16,
  },
  campoPlaceholder: {
    fontSize: 16,
    color: '#aaa',
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
  calendario: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 340,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navegar: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  navegarTexto: {
    fontSize: 22,
    color: '#2563eb',
    lineHeight: 24,
  },
  mesAno: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  semana: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  semanaTexto: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
  },
  linha: {
    flexDirection: 'row',
  },
  dia: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    margin: 1,
  },
  diaHoje: {
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  diaSelecionado: {
    backgroundColor: '#2563eb',
  },
  diaTexto: {
    fontSize: 14,
  },
  diaTextoSelecionado: {
    color: '#fff',
    fontWeight: '700',
  },
  acoes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  acoesDireita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginLeft: 'auto',
  },
  acaoSecundaria: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  acaoPrincipal: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '700',
  },
});
