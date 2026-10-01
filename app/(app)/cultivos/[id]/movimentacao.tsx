import { DateField } from '@/components/DateField';
import { LeitorPdf, type LeitorPdfRef } from '@/components/LeitorPdf';
import { SelectField } from '@/components/SelectField';
import { Botao, Campo, Carregando, Mensagem, styles as ui } from '@/components/ui';
import { abrirAnexo, enviarAnexo, removerAnexo, type AnexoPendente } from '@/lib/anexos';
import { lerBase64, lerTexto } from '@/lib/arquivos';
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
import { lerDanfe } from '@/lib/danfe';
import { lerImagem } from '@/lib/imagemNota';
import { lerNfe } from '@/lib/nfe';
import { cores } from '@/lib/tema';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCultivo } from '@/lib/useCultivo';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  const movId = params.mov || null;
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
  cultivoId: string;
  cultivoTitulo: string;
  tipo: TipoMovimentacao;
  existente: Movimentacao | null;
  pre: { descricao?: string; quantidade?: string; categoria?: string };
}) {
  const receita = tipo === 'RECEITA';
  const cor = receita ? cores.receita : cores.despesa;
  const { fazendaId } = useFazenda();

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
  // Nota fiscal anexada que ainda não foi lida: a tela pergunta antes de
  // mexer no que a pessoa já digitou.
  const [notaParaLer, setNotaParaLer] = useState<AnexoPendente | null>(null);
  const [lendoNota, setLendoNota] = useState(false);
  const leitorPdf = useRef<LeitorPdfRef>(null);
  // A faixa da nota fica lá embaixo, nos anexos, e o resultado da leitura
  // aparece no topo — junto com os itens que acabaram de entrar. Sem subir a
  // tela, quem toca em "Sim, preencher" vê a faixa sumir e mais nada.
  const rolagem = useRef<ScrollView>(null);
  // Primeira nota lida neste lançamento: dela vêm também o fornecedor e a
  // data. Da segunda em diante só os produtos — mudar a data do lançamento
  // por causa de uma segunda nota confundiria mais do que ajudaria.
  const primeiraNota = useRef(true);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const total = itens.reduce((s, i) => s + parseNumeroLivre(i.quantidade) * parseNumeroLivre(i.valor), 0);

  function mudarItem(chave: string, campo: keyof ItemForm, valor: string) {
    setItens((l) => l.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  }

  // Os produtos da nota entram junto com o que já está na tela: ler uma nota
  // não apaga o que a pessoa digitou nem os produtos de uma nota anterior, o
  // que permite lançar duas notas na mesma despesa. Sai apenas a linha em
  // branco com que o formulário abre, que não seria salva de todo jeito.
  function acrescentarItens(novos: ItemForm[]) {
    setItens((l) => [
      ...l.filter((i) => i.descricao.trim() || i.quantidade.trim() || i.valor.trim()),
      ...novos,
    ]);
  }

  // Preenche descrição, data e itens a partir do XML. Vale tanto para o botão
  // de importar quanto para o arquivo que acabou de ser anexado.
  async function preencherComNota(uri: string) {
    setErro(null);
    setAviso(null);
    try {
      const nota = lerNfe(await lerTexto(uri));
      // A descrição só é preenchida se estiver em branco: quem escreveu algo
      // ali quis aquilo, e não o nome do fornecedor.
      if (nota.emitente && !descricao.trim()) setDescricao(nota.emitente);
      if (nota.data && primeiraNota.current) setData(formatDataBR(nota.data));
      if (nota.itens.length > 0) {
        acrescentarItens(
          nota.itens.map((i) =>
            novoItem({ descricao: i.descricao, unidade: i.unidade, quantidade: paraCampo(i.quantidade), valor: paraCampo(i.valor) }),
          ),
        );
      }
      primeiraNota.current = false;
      setAviso(`✅ ${nota.itens.length} produto(s) acrescentado(s) da nota. Confira os valores e salve.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao processar o XML.');
    }
  }

  // PDF da DANFE: o texto sai do pdf.js (LeitorPdf) e o reconhecimento da
  // tabela fica em lib/danfe.ts. Diferente do XML, aqui é leitura de uma
  // página desenhada — por isso cada item é conferido pela multiplicação
  // quantidade × valor, e o que não fecha vem marcado.
  async function preencherComPdf(uri: string) {
    setErro(null);
    setAviso(null);
    try {
      const texto = await leitorPdf.current!.extrairTexto(await lerBase64(uri));
      const nota = lerDanfe(texto);
      if (nota.itens.length === 0) {
        setErro(
          'Não consegui reconhecer os produtos neste PDF. Se tiver o XML da nota, ele dá o resultado exato.',
        );
        return;
      }
      if (nota.emitente && !descricao.trim()) setDescricao(nota.emitente);
      if (nota.data && primeiraNota.current) setData(formatDataBR(nota.data));
      acrescentarItens(
        nota.itens.map((i) =>
          novoItem({
            descricao: i.descricao,
            unidade: i.unidade,
            quantidade: paraCampo(i.quantidade),
            valor: paraCampo(i.valor),
          }),
        ),
      );
      primeiraNota.current = false;
      setAviso(
        nota.paraConferir > 0
          ? `⚠️ ${nota.itens.length} produto(s) acrescentado(s), ${nota.paraConferir} com valor que não fechou. Confira antes de salvar.`
          : `✅ ${nota.itens.length} produto(s) acrescentado(s) do PDF. Confira os valores e salve.`,
      );
    } catch (e) {
      setErro(
        e instanceof Error
          ? `Falha ao ler o PDF: ${e.message}`
          : 'Falha ao ler o PDF.',
      );
    }
  }

  async function importarXml() {
    setErro(null);
    setAviso(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/xml', 'application/xml', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      await preencherComNota(r.assets[0].uri);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao processar o XML.');
    }
  }

  // XML de NF-e é dado estruturado: os produtos saem exatos. O PDF da DANFE é
  // uma página desenhada, e a leitura dele é um palpite educado — daí a
  // conferência item a item em lib/danfe.ts e o aviso na tela.
  function tipoDeNota(a: AnexoPendente): 'xml' | 'pdf' | 'imagem' | null {
    if (/\.xml$/i.test(a.nome_arquivo) || /xml/i.test(a.tipo_arquivo ?? '')) return 'xml';
    if (/\.pdf$/i.test(a.nome_arquivo) || /pdf/i.test(a.tipo_arquivo ?? '')) return 'pdf';
    if (/\.(jpe?g|png|webp|heic|heif)$/i.test(a.nome_arquivo) || /^image\//i.test(a.tipo_arquivo ?? ''))
      return 'imagem';
    return null;
  }

  // O que o serviço de leitura aceita. O seletor devolve o tipo do arquivo em
  // alguns casos e nada em outros, então o nome também vale como pista.
  function mimeDaImagem(a: AnexoPendente): string {
    const tipo = (a.tipo_arquivo ?? '').toLowerCase();
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(tipo)) return tipo;
    const ext = (a.nome_arquivo.split('.').pop() ?? '').toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    return 'image/jpeg';
  }

  // Foto do papel. Não há texto no arquivo, só pixels: a leitura acontece numa
  // função do Supabase, porque a chave do serviço não pode viajar dentro do
  // aplicativo (ver lib/imagemNota.ts). É a única das três origens que exige
  // internet sempre.
  async function preencherComImagem(anexo: AnexoPendente) {
    setErro(null);
    setAviso(null);
    try {
      const nota = await lerImagem(await lerBase64(anexo.uri), mimeDaImagem(anexo));
      if (nota.itens.length === 0) {
        setErro(
          'Não consegui reconhecer produtos nesta imagem. Fotografe o papel mais reto, com a tabela inteira e boa luz.',
        );
        return;
      }
      if (nota.emitente && !descricao.trim()) setDescricao(nota.emitente);
      if (nota.data && primeiraNota.current) setData(formatDataBR(nota.data));
      acrescentarItens(
        nota.itens.map((i) =>
          novoItem({
            descricao: i.descricao,
            unidade: i.unidade,
            quantidade: paraCampo(i.quantidade),
            valor: paraCampo(i.valor),
          }),
        ),
      );
      primeiraNota.current = false;
      setAviso(
        nota.paraConferir > 0
          ? `⚠️ ${nota.itens.length} produto(s) acrescentado(s), ${nota.paraConferir} com valor que não fechou. Confira antes de salvar.`
          : `✅ ${nota.itens.length} produto(s) acrescentado(s) da imagem. Confira os valores e salve.`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler a imagem.');
    }
  }

  // Fotografar o documento na hora: com a nota na mão, no galpão ou no
  // talhão, é o caminho mais curto. A foto vira anexo da despesa como
  // qualquer outro arquivo.
  async function fotografar() {
    setErro(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setErro('Permissão negada para acessar a câmera.');
        return;
      }
      // Sem allowsEditing: cortar a imagem costuma decepar a última coluna da
      // tabela, e aí some justamente o valor.
      const r = await ImagePicker.launchCameraAsync({ quality: 0.8, mediaTypes: ['images'] });
      if (r.canceled) return;
      const f = r.assets[0];
      const nome = f.fileName ?? `documento-${Date.now()}.jpg`;
      const anexo: AnexoPendente = { uri: f.uri, nome_arquivo: nome, tipo_arquivo: f.mimeType ?? 'image/jpeg' };
      setAnexosNovos((l) => [...l, anexo]);
      setNotaParaLer(anexo);
    } catch {
      setErro('Não foi possível usar a câmera.');
    }
  }

  async function anexar() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      const anexo: AnexoPendente = { uri: a.uri, nome_arquivo: a.name, tipo_arquivo: a.mimeType ?? null };
      setAnexosNovos((l) => [...l, anexo]);
      if (tipoDeNota(anexo)) setNotaParaLer(anexo);
    } catch {
      setErro('Não foi possível anexar o arquivo.');
    }
  }

  // O anexo já salvo abre pelo nome. Antes só o ✕ respondia ao toque: dava
  // para apagar o documento desta tela, mas não para conferir o que ele era.
  async function verAnexo(a: Anexo) {
    setErro(null);
    try {
      await abrirAnexo(a);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.');
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
          await enviarAnexo(fazendaId ?? '', id, a);
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
      <ScrollView ref={rolagem} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

        {notaParaLer && (
          <View style={styles.perguntaNota}>
            <Text style={styles.perguntaTexto}>
              <Text style={{ fontWeight: '700' }}>{notaParaLer.nome_arquivo}</Text>{' '}
              {tipoDeNota(notaParaLer) === 'imagem' ? 'parece um documento de compra' : 'parece uma nota fiscal'}.
              Quer preencher os produtos, as quantidades e os valores com os dados dele?
            </Text>
            <Text style={styles.perguntaAviso}>
              Os produtos entram junto com os que já estão na tela, sem apagar nenhum.
              {tipoDeNota(notaParaLer) === 'pdf'
                ? ' O PDF é lido da página impressa, então confira os valores; o XML da nota, quando existe, sai exato.'
                : tipoDeNota(notaParaLer) === 'imagem'
                  ? ' A foto é lida de um papel, então confira os valores; o XML da nota, quando existe, sai exato. Precisa de internet.'
                  : ''}
            </Text>
            <View style={styles.perguntaBotoes}>
              <Botao
                titulo="Não, só anexar"
                contorno
                pequeno
                cor={cores.textoSecundario}
                onPress={() => setNotaParaLer(null)}
                style={{ flex: 1 }}
              />
              <Botao
                titulo="Sim, preencher"
                pequeno
                cor={cores.chuva}
                carregando={lendoNota}
                onPress={async () => {
                  const nota = notaParaLer;
                  if (!nota) return;
                  const tipo = tipoDeNota(nota);
                  setNotaParaLer(null);
                  setLendoNota(true);
                  try {
                    if (tipo === 'pdf') await preencherComPdf(nota.uri);
                    else if (tipo === 'imagem') await preencherComImagem(nota);
                    else await preencherComNota(nota.uri);
                  } finally {
                    setLendoNota(false);
                    rolagem.current?.scrollTo({ y: 0, animated: true });
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
        {anexosSalvos.map((a) => (
          <View key={`s${a.id}`} style={styles.anexo}>
            <Pressable onPress={() => verAnexo(a)} style={styles.anexoAbrir}>
              <Text style={[styles.anexoNome, styles.anexoLink]} numberOfLines={1}>
                📄 {a.nome_arquivo}
              </Text>
            </Pressable>
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
        <View style={styles.anexoBotoes}>
          <Botao titulo="+ Anexar documento" contorno pequeno cor={cores.chuva} onPress={anexar} style={{ flex: 1 }} />
          <Botao titulo="📷 Fotografar" contorno pequeno cor={cores.chuva} onPress={fotografar} style={{ flex: 1 }} />
        </View>

        <Botao titulo={existente ? '💾 Salvar alterações' : `✅ Salvar ${receita ? 'receita' : 'despesa'}`} cor={cor} onPress={salvar} carregando={salvando} style={{ marginTop: 20 }} />
        <Botao titulo="Cancelar" contorno cor={cores.textoSecundario} onPress={() => router.back()} style={{ marginTop: 10 }} />
      </ScrollView>
      {/* Escondido: só existe para o pdf.js estar pronto quando um PDF chegar. */}
      <LeitorPdf ref={leitorPdf} />
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
  // O nome ocupa a linha menos o ✕; sublinhado para se ver que é clicável.
  anexoAbrir: { flex: 1 },
  anexoBotoes: { flexDirection: 'row', gap: 8 },
  anexoLink: { textDecorationLine: 'underline' },
  perguntaNota: {
    backgroundColor: cores.chuvaClara,
    borderWidth: 1,
    borderColor: '#90caf9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  perguntaTexto: { color: cores.texto, fontSize: 14, lineHeight: 20 },
  perguntaAviso: { color: cores.textoSecundario, fontSize: 12, marginTop: 4 },
  perguntaBotoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
