import { ComboBox } from '@/components/ComboBox';
import { ExcluirConta } from '@/components/ExcluirConta';
import { SelectField } from '@/components/SelectField';
import { Botao, BotaoConfirmar, Campo, Cartao, Carregando, Mensagem } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  cancelarConvite,
  criarConvite,
  linkDoApp,
  linkDoConvite,
  listConvitesAbertos,
  listMembros,
  removerMembro,
  salvarFazenda,
  sairDaFazenda,
  type Convite,
  type Fazenda,
  type Membro,
} from '@/lib/fazendas';
import { formatDataBR } from '@/lib/data';
import { getPerfil, listMunicipios, salvarPerfil, type Perfil } from '@/lib/perfil';
import { cores } from '@/lib/tema';
import { useRecarregarAoFocar } from '@/lib/useRecarregarAoFocar';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { ESTADOS } from '@/lib/perfil';

// Perfil: os dados da pessoa, os da fazenda e quem participa dela.
//
// A divisão importa. Nome é da pessoa e fica em `perfis`; sítio, proprietário e
// município são da fazenda e ficam em `fazendas`, à vista de todos os membros.
export default function PerfilScreen() {
  const { fazenda, carregando, erro: erroFazenda, recarregar } = useFazenda();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    getPerfil()
      .then(setPerfil)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar o perfil.'));
  }, []);

  if (carregando || !perfil) return erro ? <Mensagem texto={erro} /> : <Carregando />;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Mensagem texto={erroFazenda} />
      <DadosPessoais inicial={perfil} />
      {fazenda && (
        <>
          <DadosFazenda key={fazenda.id} inicial={fazenda} aoSalvar={recarregar} />
          <Membros key={`membros-${fazenda.id}`} fazenda={fazenda} aoMudar={recarregar} />
        </>
      )}
      <IndicarApp />
      <Sobre />
      <ExcluirConta />
    </ScrollView>
  );
}

function DadosPessoais({ inicial }: { inicial: Perfil }) {
  const { session } = useAuth();
  const [nome, setNome] = useState(inicial.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setOk(null);
    setSalvando(true);
    try {
      await salvarPerfil({ nome });
      setOk('Nome atualizado!');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao>
      <Text style={styles.secao}>👤 Você</Text>
      <Text style={styles.email}>{session?.user.email}</Text>
      <Mensagem texto={erro} />
      <Mensagem texto={ok} tipo="sucesso" />
      <Campo
        label="Seu nome"
        placeholder="Como você aparece para os outros membros"
        value={nome}
        onChangeText={(v) => {
          setOk(null);
          setNome(v);
        }}
      />
      <Botao titulo="Salvar nome" onPress={salvar} carregando={salvando} />
    </Cartao>
  );
}

function DadosFazenda({ inicial, aoSalvar }: { inicial: Fazenda; aoSalvar: () => Promise<void> }) {
  const [dados, setDados] = useState({
    nome: inicial.nome,
    nome_sitio: inicial.nome_sitio ?? '',
    proprietario: inicial.proprietario ?? '',
    uf: inicial.uf ?? '',
    municipio: inicial.municipio ?? '',
  });
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!dados.uf) return;
    listMunicipios(dados.uf)
      .then(setMunicipios)
      .catch(() => setMunicipios([]));
  }, [dados.uf]);

  const campo = (k: keyof typeof dados) => (v: string) => {
    setOk(null);
    setDados((d) => ({ ...d, [k]: v }));
  };

  async function salvar() {
    setErro(null);
    setOk(null);
    setSalvando(true);
    try {
      await salvarFazenda(inicial.id, dados);
      await aoSalvar();
      setOk('Dados da fazenda atualizados!');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao>
      <Text style={styles.secao}>🌾 Fazenda</Text>
      <Text style={styles.aviso}>Estes dados aparecem para todos os membros.</Text>
      <Mensagem texto={erro} />
      <Mensagem texto={ok} tipo="sucesso" />
      <Campo label="Nome da fazenda" placeholder="Ex: Sítio São João" value={dados.nome} onChangeText={campo('nome')} />
      <Campo label="Nome do sítio ou fazenda" placeholder="Opcional" value={dados.nome_sitio} onChangeText={campo('nome_sitio')} />
      <Campo label="Proprietário" placeholder="Nome do proprietário" value={dados.proprietario} onChangeText={campo('proprietario')} />
      <SelectField
        label="UF"
        opcoes={[{ valor: '', label: 'Selecione o estado' }, ...ESTADOS.map((e) => ({ valor: e.uf, label: `${e.uf} — ${e.nome}` }))]}
        valor={dados.uf}
        onChange={(uf) => {
          setOk(null);
          setDados((d) => ({ ...d, uf, municipio: uf === d.uf ? d.municipio : '' }));
        }}
      />
      {!!dados.uf && (
        <ComboBox
          label="Município"
          opcoes={municipios.map((m) => ({ id: m, label: m }))}
          selecionadoId={dados.municipio || null}
          onSelect={(o) => campo('municipio')(o?.id ?? '')}
          placeholder="Digite para buscar"
          vazioTexto="Nenhum município encontrado"
        />
      )}
      <Botao titulo="Salvar fazenda" onPress={salvar} carregando={salvando} />
    </Cartao>
  );
}

function Membros({ fazenda, aoMudar }: { fazenda: Fazenda; aoMudar: () => Promise<void> }) {
  const { session } = useAuth();
  const meuId = session?.user.id;
  const souDono = fazenda.dono_id === meuId;

  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function carregar() {
    try {
      const [m, c] = await Promise.all([listMembros(fazenda.id), listConvitesAbertos(fazenda.id)]);
      setMembros(m);
      setConvites(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os membros.');
    }
  }

  // Mesma recarga ao focar do resto do app: voltar de outra aba traz quem
  // entrou pelo convite nesse meio tempo.
  useRecarregarAoFocar(() => {
    void carregar();
  });

  // O convite é um link de uso único que vence em 7 dias. Quem recebe abre,
  // entra na conta dele e passa a enxergar esta mesma base.
  async function convidar() {
    setErro(null);
    setAviso(null);
    setGerando(true);
    try {
      const convite = await criarConvite(fazenda.id);
      const link = linkDoConvite(convite.token);
      const mensagem = `Entre na fazenda "${fazenda.nome}" no Agro Cultivo: ${link}`;

      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(link);
        setAviso('Link copiado! Ele vale 7 dias e serve para uma pessoa só.');
      } else {
        await Share.share({ message: mensagem });
        setAviso('Link gerado. Ele vale 7 dias e serve para uma pessoa só.');
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o convite.');
    } finally {
      setGerando(false);
    }
  }

  async function copiar(token: string) {
    await Clipboard.setStringAsync(linkDoConvite(token));
    setAviso('Link copiado.');
  }

  async function cancelar(token: string) {
    try {
      await cancelarConvite(token);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    }
  }

  async function tirar(userId: string) {
    try {
      await removerMembro(fazenda.id, userId);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover.');
    }
  }

  async function sair() {
    if (!meuId) return;
    try {
      await sairDaFazenda(fazenda.id, meuId);
      await aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível sair.');
    }
  }

  return (
    <Cartao>
      <Text style={styles.secao}>👥 Quem usa esta fazenda</Text>
      <Mensagem texto={erro} />
      <Mensagem texto={aviso} tipo="sucesso" />

      {membros === null ? (
        <Carregando />
      ) : (
        membros.map((m) => (
          <View key={m.user_id} style={styles.membro}>
            <View style={{ flex: 1 }}>
              <Text style={styles.membroNome}>
                {m.nome || m.email}
                {m.user_id === meuId ? ' (você)' : ''}
              </Text>
              <Text style={styles.membroSub}>
                {m.email} · {m.papel === 'dono' ? 'dono' : 'membro'}
              </Text>
            </View>
            {souDono && m.user_id !== meuId && (
              <BotaoConfirmar titulo="Remover" confirmar="Confirmar?" pequeno onConfirmar={() => tirar(m.user_id)} />
            )}
          </View>
        ))
      )}

      <Botao
        titulo={Platform.OS === 'web' ? '🔗 Gerar link de convite' : '🔗 Convidar alguém'}
        onPress={convidar}
        carregando={gerando}
        style={{ marginTop: 12 }}
      />
      <Text style={styles.aviso}>
        Quem abrir o link entra nesta base e passa a ver e lançar tudo. Use com quem você confia.
      </Text>

      {convites.length > 0 && (
        <View style={styles.convites}>
          <Text style={styles.subsecao}>Convites em aberto</Text>
          {convites.map((c) => (
            <View key={c.token} style={styles.convite}>
              <View style={{ flex: 1 }}>
                <Text style={styles.conviteTexto} numberOfLines={1}>
                  ...{c.token.slice(-8)}
                </Text>
                <Text style={styles.membroSub}>vence em {formatDataBR(c.expira_em.slice(0, 10))}</Text>
              </View>
              <Pressable onPress={() => copiar(c.token)} style={styles.copiar}>
                <Text style={styles.copiarTexto}>Copiar</Text>
              </Pressable>
              <BotaoConfirmar titulo="Cancelar" confirmar="Confirmar?" pequeno onConfirmar={() => cancelar(c.token)} />
            </View>
          ))}
        </View>
      )}

      {!souDono && (
        <BotaoConfirmar
          titulo="Sair desta fazenda"
          confirmar="Sair mesmo? Você perde o acesso a estes dados."
          onConfirmar={sair}
          style={{ marginTop: 16 }}
        />
      )}
    </Cartao>
  );
}

// Indicar o app para quem ainda não usa.
//
// Propositalmente separado do convite da fazenda, e com texto dizendo o que
// faz: são duas coisas que parecem a mesma e têm efeitos bem diferentes. Este
// link não dá acesso a nada seu; o outro dá acesso a tudo.
function IndicarApp() {
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const link = linkDoApp();
  const mensagem =
    'Conheça o Agro Cultivo: aplicativo para controlar a lavoura — despesas, receitas, ' +
    `chuvas, fotos e relatório da safra. Crie sua conta: ${link}`;

  async function indicar() {
    setErro(null);
    setAviso(null);
    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(mensagem);
        setAviso('Mensagem copiada. É só colar no WhatsApp.');
      } else {
        await Share.share({ message: mensagem });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível compartilhar.');
    }
  }

  return (
    <Cartao>
      <Text style={styles.secao}>📣 Indicar o app</Text>
      <Text style={styles.aviso}>
        Envie o aplicativo para outro produtor. Quem receber vai{' '}
        <Text style={styles.negrito}>criar a conta dele, com a lavoura dele</Text> — este link não
        dá acesso à sua fazenda.
      </Text>
      <Mensagem texto={erro} />
      <Mensagem texto={aviso} tipo="sucesso" />
      <Botao
        titulo={Platform.OS === 'web' ? '📋 Copiar mensagem para o WhatsApp' : '📤 Enviar pelo WhatsApp'}
        contorno
        onPress={indicar}
        style={{ marginTop: 10 }}
      />
      <Text style={styles.linkTexto} selectable>
        {link}
      </Text>
    </Cartao>
  );
}

function Sobre() {
  return (
    <Cartao style={{ alignItems: 'center' }}>
      <Text style={styles.sobreTitulo}>Sobre o app</Text>
      <Text style={styles.sobre}>🌾 Agro Cultivo v2.0.0</Text>
      <Text style={styles.sobre}>Desenvolvido por Ivonei Schmitz</Text>
      <Text style={styles.sobre}>ivonei.ti@gmail.com · (46) 99933-9307</Text>
      <Text style={[styles.sobre, { fontSize: 11, marginTop: 8 }]}>© 2026 Todos os direitos reservados.</Text>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 700, width: '100%', alignSelf: 'center' },
  secao: { fontSize: 16, fontWeight: '800', color: cores.texto, marginBottom: 8 },
  subsecao: { fontWeight: '700', color: cores.texto, marginBottom: 6 },
  email: { fontSize: 15, fontWeight: '600', color: cores.primariaEscura, marginBottom: 12 },
  aviso: { fontSize: 12, color: cores.textoSecundario, marginTop: 8 },
  negrito: { fontWeight: '700', color: cores.texto },
  linkTexto: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginTop: 10 },
  membro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2ec',
  },
  membroNome: { fontWeight: '700', color: cores.texto },
  membroSub: { fontSize: 12, color: cores.textoSecundario },
  convites: { marginTop: 16 },
  convite: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  conviteTexto: { color: cores.texto, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  copiar: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: cores.primariaClara },
  copiarTexto: { color: cores.primariaEscura, fontWeight: '700', fontSize: 13 },
  sobreTitulo: { fontWeight: '800', color: cores.texto, marginBottom: 6 },
  sobre: { color: cores.textoSecundario, fontSize: 13 },
});
