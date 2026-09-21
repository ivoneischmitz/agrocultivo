import { DateField } from '@/components/DateField';
import { SeletorMapaModal } from '@/components/SeletorMapaModal';
import { SelectField } from '@/components/SelectField';
import { Botao, Campo, Chips, Mensagem, styles as ui } from '@/components/ui';
import { nomeDoLugar, posicaoAtual } from '@/lib/clima';
import { HA_POR_ALQUEIRE, type Cultivo, type CultivoInput } from '@/lib/cultivos';
import { formatDataBR, hojeISO, parseDataBR } from '@/lib/data';
import { paraCampo, parseNumeroLivre } from '@/lib/formatar';
import { cores } from '@/lib/tema';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

// A fazenda não é escolhida no formulário: vem do contexto (cultivo novo) ou do
// próprio cultivo (edição).
type CamposCultivo = Omit<CultivoInput, 'fazenda_id'>;

const CULTURAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Arroz', 'Algodão', 'Cana-de-açúcar', 'Café'];
const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 10 }, (_, i) => String(ANO_ATUAL - 2 + i));

// Ponto padrão do mapa quando o cultivo não tem GPS (oeste do Paraná, como no
// app antigo).
const CENTRO_PADRAO = { latitude: -24.72, longitude: -53.74 };

type Props = {
  inicial: Cultivo | null;
  onSalvar: (input: CamposCultivo) => Promise<void>;
  onCancelar: () => void;
};

// Formulário de cultivo, usado por /cultivos/novo e /cultivos/[id]/editar.
// Quem chama remonta com key ao trocar de registro, em vez de um efeito
// ressincronizar o estado (mesmo padrão dos Form do Força de Vendas).
export function CultivoForm({ inicial, onSalvar, onCancelar }: Props) {
  const [cultura, setCultura] = useState(inicial?.nome_cultura ?? '');
  const [ano, setAno] = useState(inicial?.ano ?? String(ANO_ATUAL));
  const [localidade, setLocalidade] = useState(inicial?.localidade ?? '');
  const [latitude, setLatitude] = useState(inicial?.latitude != null ? String(inicial.latitude) : '');
  const [longitude, setLongitude] = useState(inicial?.longitude != null ? String(inicial.longitude) : '');
  const [hectares, setHectares] = useState(paraCampo(inicial?.area_hectares));
  const [alqueires, setAlqueires] = useState(
    inicial?.area_hectares ? paraCampo(Number((inicial.area_hectares / HA_POR_ALQUEIRE).toFixed(2))) : '',
  );
  const [dataPlantio, setDataPlantio] = useState(formatDataBR(inicial?.data_plantio ?? hojeISO()));
  const [ciclo, setCiclo] = useState(String(inicial?.ciclo_dias ?? 120));
  const [finalizado, setFinalizado] = useState(inicial?.finalizado ?? false);
  const [sacas, setSacas] = useState(paraCampo(inicial?.numero_sacas));
  const [mapaAberto, setMapaAberto] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [buscandoGps, setBuscandoGps] = useState(false);

  // Cultivo novo já tenta preencher GPS e localidade com a posição atual.
  useEffect(() => {
    if (!inicial) void usarMinhaPosicao(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function usarMinhaPosicao(silencioso = false) {
    setBuscandoGps(true);
    try {
      const p = await posicaoAtual();
      if (!p) {
        if (!silencioso) setErro('Permita o acesso à localização.');
        return;
      }
      setLatitude(String(p.latitude));
      setLongitude(String(p.longitude));
      const lugar = await nomeDoLugar(p.latitude, p.longitude);
      if (lugar) setLocalidade((atual) => atual || lugar);
    } catch {
      if (!silencioso) setErro('Não foi possível obter sua localização.');
    } finally {
      setBuscandoGps(false);
    }
  }

  function mudarHectares(v: string) {
    setHectares(v);
    const n = parseNumeroLivre(v);
    setAlqueires(n ? paraCampo(Number((n / HA_POR_ALQUEIRE).toFixed(2))) : '');
  }

  function mudarAlqueires(v: string) {
    setAlqueires(v);
    const n = parseNumeroLivre(v);
    setHectares(n ? paraCampo(Number((n * HA_POR_ALQUEIRE).toFixed(2))) : '');
  }

  async function salvar() {
    const e: Record<string, string> = {};
    if (!cultura.trim()) e.cultura = 'Selecione ou informe a cultura';
    if (!localidade.trim()) e.localidade = 'Informe a localidade';
    if (!parseNumeroLivre(hectares)) e.area = 'Informe a área';
    const plantioISO = dataPlantio ? parseDataBR(dataPlantio) : null;
    if (dataPlantio && !plantioISO) e.plantio = 'Data inválida';
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const lat = latitude.trim() ? Number(latitude.replace(',', '.')) : null;
    const lng = longitude.trim() ? Number(longitude.replace(',', '.')) : null;

    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        nome_cultura: cultura.trim(),
        ano,
        localidade: localidade.trim(),
        area_hectares: parseNumeroLivre(hectares),
        numero_sacas: finalizado ? parseNumeroLivre(sacas) : inicial?.numero_sacas ?? 0,
        finalizado,
        latitude: lat != null && Number.isFinite(lat) ? lat : null,
        longitude: lng != null && Number.isFinite(lng) ? lng : null,
        data_plantio: plantioISO,
        ciclo_dias: parseInt(ciclo, 10) || 120,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  }

  const pontoMapa = {
    latitude: Number(latitude.replace(',', '.')) || CENTRO_PADRAO.latitude,
    longitude: Number(longitude.replace(',', '.')) || CENTRO_PADRAO.longitude,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Mensagem texto={erro} />

        <Text style={ui.label}>🌾 Cultura</Text>
        <Chips opcoes={CULTURAS} valor={cultura} onChange={setCultura} />
        <View style={{ height: 10 }} />
        <Campo
          label="Ou digite o nome"
          placeholder="Ex: Soja safrinha"
          value={cultura}
          onChangeText={setCultura}
          erro={erros.cultura}
        />

        <SelectField label="📅 Ano / Safra" opcoes={ANOS.map((a) => ({ valor: a, label: a }))} valor={ano} onChange={setAno} />

        <Campo
          label="📍 Localidade"
          placeholder="Ex: Cascavel - PR"
          value={localidade}
          onChangeText={setLocalidade}
          erro={erros.localidade}
        />

        <Text style={ui.label}>🛰️ Localização GPS</Text>
        <View style={styles.linha}>
          <View style={{ flex: 1 }}>
            <Campo label="Latitude" placeholder="-24.1234" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo label="Longitude" placeholder="-53.5678" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <View style={[styles.linha, { marginBottom: 14 }]}>
          <Botao titulo="🗺️ Apontar no mapa" contorno pequeno onPress={() => setMapaAberto(true)} style={{ flex: 1 }} />
          <Botao
            titulo="📍 Minha posição"
            contorno
            pequeno
            carregando={buscandoGps}
            onPress={() => usarMinhaPosicao()}
            style={{ flex: 1 }}
          />
        </View>

        <Text style={ui.label}>📏 Área</Text>
        <View style={styles.linha}>
          <View style={{ flex: 1 }}>
            <Campo label="Hectares" placeholder="0,00" value={hectares} onChangeText={mudarHectares} keyboardType="decimal-pad" erro={erros.area} />
          </View>
          <View style={{ flex: 1 }}>
            <Campo label="Alqueires" placeholder="0,00" value={alqueires} onChangeText={mudarAlqueires} keyboardType="decimal-pad" />
          </View>
        </View>

        <View style={styles.linha}>
          <View style={{ flex: 1 }}>
            <DateField label="Data de plantio" value={dataPlantio} onChange={setDataPlantio} />
            {!!erros.plantio && <Text style={ui.erro}>{erros.plantio}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Campo label="Ciclo (dias)" placeholder="120" value={ciclo} onChangeText={setCiclo} keyboardType="number-pad" />
          </View>
        </View>

        <View style={styles.switchLinha}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitulo}>✅ Cultivo finalizado?</Text>
            <Text style={styles.switchSub}>Marque se esta safra já foi colhida</Text>
          </View>
          <Switch
            value={finalizado}
            onValueChange={setFinalizado}
            trackColor={{ false: '#cfd8cc', true: '#81c784' }}
            thumbColor={finalizado ? cores.primaria : '#f4f4f4'}
          />
        </View>

        {finalizado && (
          <Campo label="🌾 Sacas colhidas (total da safra)" placeholder="Ex: 1500" value={sacas} onChangeText={setSacas} keyboardType="decimal-pad" />
        )}

        <Botao titulo={inicial ? '💾 Salvar alterações' : '✅ Cadastrar cultivo'} onPress={salvar} carregando={salvando} style={{ marginTop: 8 }} />
        <Botao titulo="Cancelar" contorno cor={cores.textoSecundario} onPress={onCancelar} style={{ marginTop: 10 }} />
      </ScrollView>

      <SeletorMapaModal
        key={mapaAberto ? 'aberto' : 'fechado'}
        visivel={mapaAberto}
        inicial={pontoMapa}
        onFechar={() => setMapaAberto(false)}
        onConfirmar={(p) => {
          setLatitude(p.latitude.toFixed(6));
          setLongitude(p.longitude.toFixed(6));
          setMapaAberto(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 700, width: '100%', alignSelf: 'center' },
  linha: { flexDirection: 'row', gap: 10 },
  switchLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  switchTitulo: { fontWeight: '700', color: cores.texto },
  switchSub: { fontSize: 12, color: cores.textoSecundario },
});
