import { DateField } from '@/components/DateField';
import { Botao, BotaoConfirmar, Campo, Cartao, Carregando, Mensagem, Vazio } from '@/components/ui';
import { formatDataBR, hojeISO, parseDataBR } from '@/lib/data';
import { parseNumeroLivre, quantidade } from '@/lib/formatar';
import {
  chuvaDoPeriodo,
  createChuvas,
  deleteChuva,
  limparChuvas,
  listChuvas,
  type RegistroChuva,
} from '@/lib/pluviometria';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import { useVersaoDados } from '@/lib/useVersaoDados';
import { usePaddingInferior } from '@/lib/usePaddingInferior';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ChuvasScreen() {
  const { cultivoId, cultivo } = useCultivo();
  const [registros, setRegistros] = useState<RegistroChuva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [importando, setImportando] = useState(false);

  function carregar() {
    listChuvas(cultivoId)
      .then(setRegistros)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }
  useRecarregarAoFocar(carregar, useVersaoDados());

  const temGps = cultivo?.latitude != null && cultivo?.longitude != null;
  const total = (registros ?? []).reduce((s, r) => s + r.milimetros, 0);

  // Baixa do Open-Meteo a chuva diária desde o plantio e grava os dias com
  // pelo menos 1 mm que ainda não têm registro.
  async function importarHistorico() {
    if (!cultivo || !temGps) return;
    setErro(null);
    setAviso(null);
    setImportando(true);
    try {
      const inicio = cultivo.data_plantio ?? `${new Date().getFullYear()}-01-01`;
      const dias = await chuvaDoPeriodo(cultivo.latitude!, cultivo.longitude!, inicio, hojeISO());
      const existentes = new Set((registros ?? []).map((r) => r.data));
      const novos = dias
        .filter((d) => d.milimetros >= 1 && !existentes.has(d.data))
        .map((d) => ({ cultivo_id: cultivoId, data: d.data, milimetros: d.milimetros, observacao: 'Sincronização automática' }));
      await createChuvas(novos);
      setAviso(`✅ ${novos.length} registro(s) de chuva importado(s) desde ${formatDataBR(inicio)}.`);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao importar histórico.');
    } finally {
      setImportando(false);
    }
  }

  async function limpar() {
    try {
      await limparChuvas(cultivoId);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível limpar.');
    }
  }

  if (registros === null && !erro) return <Carregando />;

  // Últimos 7 registros, do mais antigo para o mais novo.
  const ultimos = [...(registros ?? [])].slice(0, 7).reverse();
  const maxMm = Math.max(1, ...ultimos.map((r) => r.milimetros));

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={registros ?? []}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View>
            <Cartao style={{ alignItems: 'center', backgroundColor: cores.chuvaClara, borderColor: '#90caf9' }}>
              {cultivo && <Text style={styles.sub}>{cultivo.nome_cultura} · {cultivo.ano}</Text>}
              <Text style={styles.rotulo}>Precipitação acumulada</Text>
              <Text style={styles.total}>{quantidade(Number(total.toFixed(1)))} mm</Text>
            </Cartao>

            <View style={styles.botoes}>
              <Botao titulo="+ Novo registro" cor={cores.chuva} pequeno onPress={() => setNovoAberto(true)} style={{ flex: 1 }} />
              <Botao
                titulo="🛰️ Importar histórico"
                cor={cores.chuva}
                contorno
                pequeno
                carregando={importando}
                desabilitado={!temGps}
                onPress={importarHistorico}
                style={{ flex: 1 }}
              />
            </View>
            {!temGps && cultivo && (
              <Text style={styles.dica}>Cadastre a localização GPS do cultivo para puxar chuvas do satélite.</Text>
            )}

            <Mensagem texto={erro} />
            <Mensagem texto={aviso} tipo="sucesso" />

            {ultimos.length > 0 && (
              <Cartao>
                <Text style={styles.secao}>Últimas chuvas (mm)</Text>
                <View style={styles.grafico}>
                  {ultimos.map((r) => (
                    <View key={r.id} style={styles.colunaGrafico}>
                      <Text style={styles.valorBarra}>{quantidade(Number(r.milimetros.toFixed(1)))}</Text>
                      <View style={[styles.barra, { height: Math.max(4, (r.milimetros / maxMm) * 110) }]} />
                      <Text style={styles.diaBarra}>{r.data.slice(8, 10)}/{r.data.slice(5, 7)}</Text>
                    </View>
                  ))}
                </View>
              </Cartao>
            )}
          </View>
        }
        ListEmptyComponent={<Vazio icone="🌧️" titulo="Nenhum registro de chuva ainda." />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemData}>{formatDataBR(item.data)}</Text>
              {!!item.observacao && <Text style={styles.sub}>{item.observacao}</Text>}
            </View>
            <Text style={styles.itemMm}>{quantidade(Number(item.milimetros.toFixed(1)))} mm</Text>
            <Pressable
              onPress={() => deleteChuva(item.id).then(carregar).catch(() => setErro('Não foi possível excluir.'))}
              style={{ padding: 8 }}
              accessibilityLabel="Excluir registro"
            >
              <Text>🗑️</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          (registros ?? []).length > 0 ? (
            <BotaoConfirmar
              titulo="🗑️ Apagar todos os registros"
              confirmar="Apagar TODAS as chuvas deste cultivo?"
              pequeno
              onConfirmar={limpar}
              style={{ marginTop: 12 }}
            />
          ) : null
        }
      />

      {cultivo && (
        <NovoRegistroModal
          key={novoAberto ? 'aberto' : 'fechado'}
          visivel={novoAberto}
          latitude={cultivo.latitude}
          longitude={cultivo.longitude}
          onFechar={() => setNovoAberto(false)}
          onSalvar={async (r) => {
            await createChuvas([{ cultivo_id: cultivoId, ...r }]);
            setNovoAberto(false);
            carregar();
          }}
        />
      )}
    </View>
  );
}

function NovoRegistroModal({
  visivel,
  latitude,
  longitude,
  onFechar,
  onSalvar,
}: {
  visivel: boolean;
  latitude: number | null;
  longitude: number | null;
  onFechar: () => void;
  onSalvar: (r: { data: string; milimetros: number; observacao: string | null }) => Promise<void>;
}) {
  const padding = usePaddingInferior(20);
  const [data, setData] = useState(formatDataBR(hojeISO()));
  const [mm, setMm] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function puxar() {
    const iso = parseDataBR(data);
    if (!iso) return setErro('Data inválida.');
    if (latitude == null || longitude == null) return setErro('Este cultivo não tem coordenadas GPS.');
    setErro(null);
    setBuscando(true);
    try {
      const [dia] = await chuvaDoPeriodo(latitude, longitude, iso, iso);
      if (!dia) return setErro('Sem dados de chuva para esta data e local.');
      setMm(String(dia.milimetros).replace('.', ','));
      setObs('Sincronizado via satélite (Open-Meteo)');
    } catch {
      setErro('Falha ao buscar dados na web. Verifique sua conexão.');
    } finally {
      setBuscando(false);
    }
  }

  async function salvar() {
    const iso = parseDataBR(data);
    if (!iso) return setErro('Data inválida.');
    if (!mm.trim()) return setErro('Informe a quantidade de milímetros.');
    setSalvando(true);
    try {
      await onSalvar({ data: iso, milimetros: parseNumeroLivre(mm), observacao: obs.trim() || null });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={styles.fundoModal}>
        <View style={[styles.modal, padding]}>
          <Text style={styles.modalTitulo}>Novo registro de chuva</Text>
          <Mensagem texto={erro} />
          <DateField label="Data" value={data} onChange={setData} permiteLimpar={false} />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Campo label="Milímetros (mm)" placeholder="Ex: 25,5" keyboardType="decimal-pad" value={mm} onChangeText={setMm} />
            </View>
            <Botao titulo="🛰️ Puxar" cor={cores.chuva} contorno pequeno carregando={buscando} onPress={puxar} style={{ marginBottom: 14 }} />
          </View>
          <Campo label="Observação (opcional)" placeholder="Ex: Chuva mansa" value={obs} onChangeText={setObs} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Botao titulo="Cancelar" contorno cor={cores.textoSecundario} onPress={onFechar} style={{ flex: 1 }} />
            <Botao titulo="Salvar" cor={cores.chuva} carregando={salvando} onPress={salvar} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, paddingBottom: 32, maxWidth: 900, width: '100%', alignSelf: 'center' },
  sub: { color: cores.textoSecundario, fontSize: 13 },
  rotulo: { color: cores.textoSecundario, marginTop: 4 },
  total: { fontSize: 30, fontWeight: '800', color: cores.chuva },
  botoes: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dica: { color: cores.textoSecundario, fontSize: 12, marginBottom: 10, textAlign: 'center' },
  secao: { fontSize: 15, fontWeight: '800', color: cores.texto, marginBottom: 10 },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 150 },
  colunaGrafico: { alignItems: 'center', flex: 1 },
  valorBarra: { fontSize: 11, color: cores.chuva, fontWeight: '700', marginBottom: 2 },
  barra: { width: 22, backgroundColor: cores.chuva, borderRadius: 4 },
  diaBarra: { fontSize: 11, color: cores.textoSecundario, marginTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  itemData: { fontWeight: '700', color: cores.texto },
  itemMm: { fontSize: 16, fontWeight: '800', color: cores.chuva, marginRight: 4 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, width: '100%', maxWidth: 600, alignSelf: 'center' },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: cores.texto, marginBottom: 14 },
});
