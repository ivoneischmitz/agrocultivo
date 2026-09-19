import { ComboBox } from '@/components/ComboBox';
import { SelectField } from '@/components/SelectField';
import { Botao, Campo, Cartao, Carregando, Mensagem } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ESTADOS, getPerfil, listMunicipios, salvarPerfil, type Perfil } from '@/lib/perfil';
import { cores } from '@/lib/tema';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

// Perfil do produtor. No app antigo ficava no SQLite do aparelho (e se perdia
// ao trocar de celular); agora é a tabela perfis, uma linha por conta.
export default function PerfilScreen() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    getPerfil()
      .then(setPerfil)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar o perfil.'));
  }, []);

  if (!perfil) return erro ? <Mensagem texto={erro} /> : <Carregando />;
  return <FormPerfil inicial={perfil} />;
}

function FormPerfil({ inicial }: { inicial: Perfil }) {
  const { session } = useAuth();
  const [p, setP] = useState(inicial);
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!p.uf) return;
    listMunicipios(p.uf)
      .then(setMunicipios)
      .catch(() => setMunicipios([]));
  }, [p.uf]);

  const campo = (k: keyof Perfil) => (v: string) => {
    setOk(null);
    setP((atual) => ({ ...atual, [k]: v }));
  };

  async function salvar() {
    setErro(null);
    setOk(null);
    setSalvando(true);
    try {
      await salvarPerfil(p);
      setOk('Perfil atualizado!');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Mensagem texto={erro} />
        <Mensagem texto={ok} tipo="sucesso" />
        <Campo label="Nome" placeholder="Seu nome" value={p.nome} onChangeText={campo('nome')} />
        <Campo label="Nome do sítio ou fazenda" placeholder="Ex: Fazenda São João" value={p.nome_sitio} onChangeText={campo('nome_sitio')} />
        <Campo label="Proprietário" placeholder="Nome do proprietário" value={p.proprietario} onChangeText={campo('proprietario')} />
        <SelectField
          label="UF"
          opcoes={[{ valor: '', label: 'Selecione o estado' }, ...ESTADOS.map((e) => ({ valor: e.uf, label: `${e.uf} — ${e.nome}` }))]}
          valor={p.uf}
          onChange={(uf) => {
            setOk(null);
            setP((atual) => ({ ...atual, uf, municipio: uf === atual.uf ? atual.municipio : '' }));
          }}
        />
        {!!p.uf && (
          <ComboBox
            label="Município"
            opcoes={municipios.map((m) => ({ id: m, label: m }))}
            selecionadoId={p.municipio || null}
            onSelect={(o) => campo('municipio')(o?.id ?? '')}
            placeholder="Digite para buscar"
            vazioTexto="Nenhum município encontrado"
          />
        )}
        <Botao titulo="Salvar perfil" onPress={salvar} carregando={salvando} style={{ marginTop: 8 }} />
      </Cartao>

      <Cartao style={{ alignItems: 'center' }}>
        <Text style={styles.sobreTitulo}>Sobre o app</Text>
        <Text style={styles.sobre}>🌾 Agro Cultivo v2.0.0</Text>
        <Text style={styles.sobre}>Desenvolvido por Ivonei Schmitz</Text>
        <Text style={styles.sobre}>ivonei.ti@gmail.com · (46) 99933-9307</Text>
        <Text style={[styles.sobre, { fontSize: 11, marginTop: 8 }]}>© 2026 Todos os direitos reservados.</Text>
      </Cartao>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 700, width: '100%', alignSelf: 'center' },
  email: { fontSize: 16, fontWeight: '700', color: cores.primariaEscura, marginBottom: 12 },
  sobreTitulo: { fontWeight: '800', color: cores.texto, marginBottom: 6 },
  sobre: { color: cores.textoSecundario, fontSize: 13 },
});
