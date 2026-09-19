import { DateField } from '@/components/DateField';
import { SelectField } from '@/components/SelectField';
import { Botao, Campo, Carregando, Mensagem, styles as ui } from '@/components/ui';
import { enviarAnexo, removerAnexo, type AnexoPendente } from '@/lib/anexos';
import { lerTexto } from '@/lib/arquivos';
import { formatDataBR, hojeISO, parseDataBR } from '@/lib/data';
import { moeda, paraCampo, parseNumeroLivre } from '@/lib/formatar';
import {
  CATEGORIAS,
  getMovimentacao,
  iconeCategoria,
  salvarMovimentacao,
  UNIDADES,
  type Anexo,
  type Movimentacao,
  type TipoMovimentacao,
} from '@/lib/movimentacoes';
import { lerNfe } from '@/lib/nfe';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type ItemForm = { chave: string; descricao: string; unidade: string; quantidade: string; valor: string };

let seq = 0;
const novoItem = (p: Partial<ItemForm> = {}): ItemForm => ({
  chave: `i${++seq}`,
  descricao: '',
  unidade: 'UN - Unidade',
  quantidade: '',
  valor: '',
  ...p,
});

// Cadastro/edição de uma despesa ou receita. Parâmetros na URL:
//   tipo=DESPESA|RECEITA, mov=<id> para editar,
//   desc/qtd/cat para vir pré-preenchido (Calculadora de sementes).
export default function MovimentacaoScreen() {
  const params = useLocalSearchParams<{ tipo?: string; mov?: string; desc?: string; qtd?: string; cat?: string }>();
  const movId = params.mov ? Number(params.mov) : null;
  const { cultivoId, cultivo } = useCultivo();
  const [existente, setExistente] = useState<Movimentacao | null>(null);
  const [carregando, setCarregando] = useState(movId != null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (movId == null) return;
    getMovimentacao(movId)
      .then(setExistente)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setCarregando(false));
  }, [movId]);

  if (carregando) return <Carregando />;
  if (movId != null && !existente) {
    return (
      <View style={{ padding: 16 }}>
        <Mensagem texto={erro ?? 'Movimentação não encontrada.'} />
      </View>
    );
  }

  const tipo: TipoMovimentacao = existente?.tipo ?? (params.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA');

  return (
    <Formulario
      key={existente?.id ?? 'nova'}
      cultivoId={cultivoId}
      cultivoTitulo={cultivo ? `${cultivo.nome_cultura} · ${cultivo.ano} · ${cultivo.localidade}` : ''}
      tipo={tipo}
      existente={existente}
      pre={{ descricao: params.desc, quantidade: params.qtd, categoria: params.cat }}
    />
  );
}

function Formulario({
  cultivoId,
  cultivoTitulo,
  tipo,
  existente,
  pre,
}: {
  cultivoId: number;
  cultivoTitulo: string;
  tipo: TipoMovimentacao;
  existente: Movimentacao | null;
  pre: { descricao?: string; quantidade?: string; categoria?: string };
}) {
  const receita = tipo === 'RECEITA';
  const cor = receita ? cores.receita : cores.despesa;

  const [descricao, setDescricao] = useState(existente?.descricao ?? pre.descricao ?? '');
  const [data, setData] = useState(formatDataBR(existente?.data ?? hojeISO()));
  const [categoria, setCategoria] = useState(existente?.categoria ?? pre.categoria ?? '');
  const [itens, setItens] = useState<ItemForm[]>(() => {
    if (existente && existente.itens.length > 0) {
      return existente.itens.map((i) =>
        novoItem({ descricao: i.descricao, unidade: i.unidade, quantidade: paraCampo(i.quantidade), valor: paraCampo(i.valor) }),
      );
    }
    if (pre.descricao) return [novoItem({ descricao: pre.descricao, quantidade: pre.quantidade ?? '' })];
    return [novoItem()];
  });
  const [anexosSalvos, setAnexosSalvos] = useState<Anexo[]>(existente?.anexos ?? []);
  const [anexosNovos, setAnexosNovos] = useState<AnexoPendente[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const total = itens.reduce((s, i) => s + parseNumeroLivre(i.quantidade) * parseNumeroLivre(i.valor), 0);

  function mudarItem(chave: string, campo: keyof ItemForm, valor: string) {
    setItens((l) => l.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  }

  async function importarXml() {
    setErro(null);
    setAviso(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/xml', 'application/xml', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      const nota = lerNfe(await lerTexto(r.assets[0].uri));
      if (nota.emitente) setDescricao(nota.emitente);
      if (nota.data) setData(formatDataBR(nota.data));
      if (nota.itens.length > 0) {
        setItens(
          nota.itens.map((i) =>
            novoItem({ descricao: i.descricao, unidade: i.unidade, quantidade: paraCampo(i.quantidade), valor: paraCampo(i.valor) }),
          ),
        );
      }
      setAviso('✅ Dados da NF-e importados. Confira e salve.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao processar o XML.');
    }
  }

  async function anexar() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      setAnexosNovos((l) => [...l, { uri: a.uri, nome_arquivo: a.name, tipo_arquivo: a.mimeType ?? null }]);
    } catch {
      setErro('Não foi possível anexar o arquivo.');
    }
  }

  async function tirarAnexoSalvo(a: Anexo) {
    try {
      await removerAnexo(a);
      setAnexosSalvos((l) => l.filter((x) => x.id !== a.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover o anexo.');
    }
  }

  async function salvar() {
    const e: Record<string, string> = {};
    if (!descricao.trim()) e.descricao = receita ? 'Descreva a origem da receita' : 'Dê um nome para esta despesa';
    const dataISO = parseDataBR(data);
    if (!dataISO) e.data = 'Informe uma data válida';
    setErros(e);
    if (Object.keys(e).length > 0 || !dataISO) return;

    setSalvando(true);
    setErro(null);
    try {
      const id = await salvarMovimentacao(existente?.id ?? null, {
        cultivo_id: cultivoId,
        tipo,
        descricao: descricao.trim(),
        data: dataISO,
        categoria: categoria || null,
        itens: itens
          .filter((i) => i.descricao.trim())
          .map((i) => ({
            descricao: i.descricao.trim(),
            unidade: i.unidade,
            quantidade: parseNumeroLivre(i.quantidade),
            valor: parseNumeroLivre(i.valor),
          })),
      });

      // Anexos sobem depois: a movimentação já está salva, então uma falha
      // aqui não perde o lançamento — só avisa qual arquivo não foi.
      const falharam: string[] = [];
      for (const a of anexosNovos) {
        try {
          await enviarAnexo(id, a);
        } catch {
          falharam.push(a.nome_arquivo);
        }
      }
      if (falharam.length > 0) {
        setErro(`Lançamento salvo, mas não foi possível enviar: ${falharam.join(', ')}`);
        setAnexosNovos((l) => l.filter((a) => falharam.includes(a.nome_arquivo)));
        setSalvando(false);
        return;
      }
      router.back();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  const titulo = `${existente ? 'Editar' : 'Nova'} ${receita ? 'receita' : 'despesa'}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: titulo }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!!cultivoTitulo && <Text style={styles.cultivo}>🌾 {cultivoTitulo}</Text>}

        <Mensagem texto={erro} />
        <Mensagem texto={aviso} tipo="sucesso" />

        <Botao titulo="📥 Importar XML da NF-e" contorno cor={cores.chuva} onPress={importarXml} style={{ marginBottom: 14 }} />

        <Campo
          label="📝 Descrição / finalidade"
          placeholder={receita ? 'Ex: Venda safra 2025' : 'Ex: Adubação de cobertura'}
          value={descricao}
          onChangeText={setDescricao}
          erro={erros.descricao}
        />

        <DateField label="📅 Data" value={data} onChange={setData} permiteLimpar={false} />
        {!!erros.data && <Text style={ui.erro}>{erros.data}</Text>}

        <Text style={[ui.label, { marginTop: 4 }]}>🏷️ Categoria</Text>
        <View style={styles.categorias}>
          {CATEGORIAS[tipo].map((c) => {
            const ativa = c === categoria;
            return (
              <Pressable
                key={c}
                onPress={() => setCategoria(ativa ? '' : c)}
                style={[styles.categoria, ativa && { backgroundColor: cor, borderColor: cor }]}
              >
                <Text style={[styles.categoriaTexto, ativa && { color: '#fff', fontWeight: '700' }]}>
                  {iconeCategoria(c)} {c}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[ui.label, { marginTop: 16 }]}>{receita ? '💰 Itens da receita' : '📦 Produtos utilizados'}</Text>
        {itens.map((i, idx) => {
          // Unidade vinda da NF-e ("KG") pode não estar na lista: entra como opção.
          const opcoes = (UNIDADES.includes(i.unidade) ? UNIDADES : [i.unidade, ...UNIDADES]).map((u) => ({ valor: u, label: u }));
          return (
            <View key={i.chave} style={styles.item}>
              <View style={styles.itemTopo}>
                <View style={{ flex: 1 }}>
                  <Campo
                    label={`Item ${idx + 1}`}
                    placeholder={receita ? 'Ex: Soja em grão' : 'Ex: Ureia'}
                    value={i.descricao}
                    onChangeText={(v) => mudarItem(i.chave, 'descricao', v)}
                  />
                </View>
                {itens.length > 1 && (
                  <Pressable
                    onPress={() => setItens((l) => l.filter((x) => x.chave !== i.chave))}
                    style={styles.remover}
                    accessibilityLabel="Remover item"
                  >
                    <Text style={styles.removerTexto}>✕</Text>
                  </Pressable>
                )}
              </View>
              <SelectField label="Unidade" opcoes={opcoes} valor={i.unidade} onChange={(v) => mudarItem(i.chave, 'unidade', v)} />
              <View style={styles.linha}>
                <View style={{ flex: 1 }}>
                  <Campo label="Quantidade" placeholder="0" keyboardType="decimal-pad" value={i.quantidade} onChangeText={(v) => mudarItem(i.chave, 'quantidade', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo label="Valor unit. (R$)" placeholder="0,00" keyboardType="decimal-pad" value={i.valor} onChangeText={(v) => mudarItem(i.chave, 'valor', v)} />
                </View>
              </View>
              <Text style={styles.subtotal}>
                Subtotal: <Text style={{ color: cor, fontWeight: '800' }}>{moeda(parseNumeroLivre(i.quantidade) * parseNumeroLivre(i.valor))}</Text>
              </Text>
            </View>
          );
        })}
        <Botao titulo="+ Adicionar item" contorno pequeno cor={cor} onPress={() => setItens((l) => [...l, novoItem()])} />

        <View style={styles.total}>
          <Text style={styles.totalRotulo}>Total</Text>
          <Text style={[styles.totalValor, { color: cor }]}>{moeda(total)}</Text>
        </View>

        <Text style={[ui.label, { marginTop: 8 }]}>📎 Anexos (notas fiscais, documentos)</Text>
        {anexosSalvos.map((a) => (
          <View key={`s${a.id}`} style={styles.anexo}>
            <Text style={styles.anexoNome} numberOfLines={1}>📄 {a.nome_arquivo}</Text>
            <Pressable onPress={() => tirarAnexoSalvo(a)}>
              <Text style={styles.removerTexto}>✕</Text>
            </Pressable>
          </View>
        ))}
        {anexosNovos.map((a, idx) => (
          <View key={`n${idx}`} style={styles.anexo}>
            <Text style={styles.anexoNome} numberOfLines={1}>📄 {a.nome_arquivo} (novo)</Text>
            <Pressable onPress={() => setAnexosNovos((l) => l.filter((_, j) => j !== idx))}>
              <Text style={styles.removerTexto}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Botao titulo="+ Anexar documento" contorno pequeno cor={cores.chuva} onPress={anexar} />

        <Botao titulo={existente ? '💾 Salvar alterações' : `✅ Salvar ${receita ? 'receita' : 'despesa'}`} cor={cor} onPress={salvar} carregando={salvando} style={{ marginTop: 20 }} />
        <Botao titulo="Cancelar" contorno cor={cores.textoSecundario} onPress={() => router.back()} style={{ marginTop: 10 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  cultivo: { color: cores.textoSecundario, marginBottom: 12, fontWeight: '600' },
  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoria: { borderWidth: 1, borderColor: cores.borda, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12 },
  categoriaTexto: { color: cores.texto, fontSize: 14 },
  item: { backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderRadius: 10, padding: 12, marginBottom: 10 },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  remover: { marginTop: 28, padding: 8 },
  removerTexto: { color: cores.despesa, fontSize: 18, fontWeight: '700', paddingHorizontal: 6 },
  linha: { flexDirection: 'row', gap: 10 },
  subtotal: { textAlign: 'right', color: cores.textoSecundario },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 14,
    marginVertical: 14,
  },
  totalRotulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  totalValor: { fontSize: 20, fontWeight: '800' },
  anexo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  anexoNome: { flex: 1, color: cores.texto },
});
