import { cores } from '@/lib/tema';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

// Peças pequenas repetidas em todas as telas. Ficam juntas num arquivo porque
// cada uma é só estilo + meia dúzia de linhas.

type BotaoProps = {
  titulo: string;
  onPress: () => void;
  cor?: string;
  corTexto?: string;
  contorno?: boolean;
  carregando?: boolean;
  desabilitado?: boolean;
  pequeno?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Botao({
  titulo,
  onPress,
  cor = cores.primaria,
  corTexto,
  contorno,
  carregando,
  desabilitado,
  pequeno,
  style,
}: BotaoProps) {
  const inativo = carregando || desabilitado;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.botao,
        pequeno && styles.botaoPequeno,
        contorno ? { borderWidth: 1, borderColor: cor, backgroundColor: '#fff' } : { backgroundColor: cor },
        (pressed || inativo) && { opacity: 0.6 },
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={contorno ? cor : '#fff'} />
      ) : (
        <Text
          style={[
            styles.botaoTexto,
            pequeno && styles.botaoTextoPequeno,
            { color: corTexto ?? (contorno ? cor : '#fff') },
          ]}
        >
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

// Botão de ação sem volta (excluir, limpar): o primeiro toque só arma, o
// segundo confirma. É o padrão do Força de Vendas — Alert.alert com botões não
// aparece na web.
export function BotaoConfirmar({
  titulo,
  confirmar = 'Toque de novo para confirmar',
  onConfirmar,
  cor = cores.despesa,
  pequeno,
  style,
}: {
  titulo: string;
  confirmar?: string;
  onConfirmar: () => void | Promise<void>;
  cor?: string;
  pequeno?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [armado, setArmado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Desarma sozinho, para um toque esquecido não ficar esperando.
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  return (
    <Botao
      titulo={armado ? confirmar : titulo}
      cor={cor}
      contorno={!armado}
      pequeno={pequeno}
      carregando={ocupado}
      style={style}
      onPress={async () => {
        if (!armado) {
          setArmado(true);
          return;
        }
        setArmado(false);
        setOcupado(true);
        try {
          await onConfirmar();
        } finally {
          setOcupado(false);
        }
      }}
    />
  );
}

export function Campo({
  label,
  erro,
  style,
  ...props
}: TextInputProps & { label: string; erro?: string | null }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9aa89a"
        {...props}
        style={[styles.input, !!erro && styles.inputErro, style]}
      />
      {!!erro && <Text style={styles.erro}>{erro}</Text>}
    </View>
  );
}

export function Cartao({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.cartao, style]}>{children}</View>;
}

export function Mensagem({ texto, tipo = 'erro' }: { texto: string | null; tipo?: 'erro' | 'sucesso' }) {
  if (!texto) return null;
  return (
    <Text style={[styles.mensagem, tipo === 'erro' ? styles.mensagemErro : styles.mensagemSucesso]}>
      {texto}
    </Text>
  );
}

export function Carregando() {
  return (
    <View style={styles.centro}>
      <ActivityIndicator color={cores.primaria} size="large" />
    </View>
  );
}

export function Vazio({ icone, titulo, subtitulo }: { icone: string; titulo: string; subtitulo?: string }) {
  return (
    <View style={styles.vazio}>
      <Text style={styles.vazioIcone}>{icone}</Text>
      <Text style={styles.vazioTitulo}>{titulo}</Text>
      {!!subtitulo && <Text style={styles.vazioSub}>{subtitulo}</Text>}
    </View>
  );
}

// Chips de escolha rápida (culturas, filtros).
export function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: readonly T[];
  valor: T | string;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {opcoes.map((o) => {
        const ativo = o === valor;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={[styles.chip, ativo && styles.chipAtivo]}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
          >
            <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Barra horizontal simples (gráficos). Substitui o react-native-chart-kit do
// app antigo: uma dependência a menos e funciona igual na web.
export function BarraHorizontal({
  rotulo,
  valor,
  maximo,
  cor,
  texto,
}: {
  rotulo: string;
  valor: number;
  maximo: number;
  cor: string;
  texto: string;
}) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <View style={styles.barraLinha}>
      <View style={styles.barraTopo}>
        <Text style={styles.barraRotulo} numberOfLines={1}>
          {rotulo}
        </Text>
        <Text style={[styles.barraValor, { color: cor }]}>{texto}</Text>
      </View>
      <View style={styles.barraFundo}>
        <View style={[styles.barraCheia, { width: `${pct}%`, backgroundColor: cor }]} />
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  botao: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPequeno: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  botaoTexto: { fontSize: 16, fontWeight: '700' },
  botaoTextoPequeno: { fontSize: 13, fontWeight: '600' },
  campo: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d0d8cd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: cores.texto,
  },
  inputErro: { borderColor: cores.erro },
  erro: { color: cores.erro, fontSize: 12, marginTop: 4 },
  cartao: {
    backgroundColor: cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 16,
    marginBottom: 12,
  },
  mensagem: { padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center' },
  mensagemErro: { backgroundColor: cores.despesaClara, color: cores.erro },
  mensagemSucesso: { backgroundColor: cores.receitaClara, color: cores.primariaEscura },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vazio: { alignItems: 'center', padding: 40 },
  vazioIcone: { fontSize: 56, marginBottom: 12 },
  vazioTitulo: { fontSize: 18, fontWeight: '700', color: cores.texto, textAlign: 'center' },
  vazioSub: { fontSize: 14, color: cores.textoSecundario, textAlign: 'center', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.texto, fontSize: 14 },
  chipTextoAtivo: { color: '#fff', fontWeight: '600' },
  barraLinha: { marginBottom: 10 },
  barraTopo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  barraRotulo: { flex: 1, color: cores.texto, fontSize: 13 },
  barraValor: { fontSize: 13, fontWeight: '700' },
  barraFundo: { height: 10, backgroundColor: '#eef2ec', borderRadius: 5, overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 5 },
});
