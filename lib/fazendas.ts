import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { fazendasGuardadas, guardarFazendas } from '@/lib/fazendasCache';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

// Fazenda: a base de dados compartilhada por uma ou mais pessoas. Quem lança
// continua registrado em user_id, mas o dono do dado é a fazenda (ver
// supabase/fazendas.sql).

export type Fazenda = {
  id: string;
  nome: string;
  nome_sitio: string | null;
  proprietario: string | null;
  uf: string | null;
  municipio: string | null;
  dono_id: string;
};

export type Membro = {
  user_id: string;
  email: string;
  nome: string | null;
  papel: 'dono' | 'membro';
  entrou_em: string;
};

export type Convite = {
  token: string;
  created_at: string;
  expira_em: string;
  usado_em: string | null;
  cancelado_em: string | null;
};

// No celular, a lista também fica guardada na cópia local: sem isso, abrir o
// app sem sinal travaria antes de qualquer tela, porque tudo depende de saber
// em que fazenda o app está. Na web o cache não faz nada.
export async function listMinhasFazendas(): Promise<Fazenda[]> {
  try {
    const { data, error } = await supabase
      .from('fazendas')
      .select('*')
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    const lista = data ?? [];
    guardarFazendas(lista);
    return lista;
  } catch (e) {
    const guardadas = fazendasGuardadas();
    if (guardadas) return guardadas;
    throw e;
  }
}

// Conta nova chega sem fazenda nenhuma; a função no banco cria a primeira.
export async function garantirFazenda(): Promise<string> {
  const { data, error } = await supabase.rpc('garantir_fazenda');
  if (error) throw error;
  return data as string;
}

export async function salvarFazenda(
  id: string,
  dados: Pick<Fazenda, 'nome' | 'nome_sitio' | 'proprietario' | 'uf' | 'municipio'>,
): Promise<void> {
  const limpo = (v: string | null) => (v && v.trim() !== '' ? v.trim() : null);
  const { error } = await supabase
    .from('fazendas')
    .update({
      nome: dados.nome.trim() || 'Minha fazenda',
      nome_sitio: limpo(dados.nome_sitio),
      proprietario: limpo(dados.proprietario),
      uf: limpo(dados.uf),
      municipio: limpo(dados.municipio),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function listMembros(fazendaId: string): Promise<Membro[]> {
  const { data, error } = await supabase.rpc('membros_da_fazenda', { p_fazenda: fazendaId });
  if (error) throw error;
  return (data ?? []) as Membro[];
}

export async function removerMembro(fazendaId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('fazenda_membros')
    .delete()
    .eq('fazenda_id', fazendaId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Convites ─────────────────────────────────────────────────────────────────

// O código do link é sorteado pelo expo-crypto (o `crypto` global não existe
// no React Native) e tem 256 bits: longo demais para alguém adivinhar por
// tentativa.
function novoToken(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Endereço do app publicado. Sem ele o link sairia relativo e não abriria no
// celular de quem recebe.
function baseDoSite(): string {
  const env = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (env) return env;
  if (Platform.OS === 'web') return window.location.origin;
  return 'https://agrocultivo.vercel.app';
}

export function linkDoConvite(token: string): string {
  return `${baseDoSite()}/convite/${token}`;
}

// Endereço do app, para indicar a alguém que ainda não usa. Não confundir com
// linkDoConvite: este não dá acesso a fazenda nenhuma — quem abre cria a
// própria conta, com a própria lavoura.
export function linkDoApp(): string {
  return baseDoSite();
}

export async function criarConvite(fazendaId: string): Promise<Convite> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sessão expirada. Entre novamente.');

  const { data, error } = await supabase
    .from('convites')
    .insert({ token: novoToken(), fazenda_id: fazendaId, criado_por: u.user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Convite;
}

// Só os que ainda valem: não usados, não cancelados e dentro do prazo.
export async function listConvitesAbertos(fazendaId: string): Promise<Convite[]> {
  const { data, error } = await supabase
    .from('convites')
    .select('*')
    .eq('fazenda_id', fazendaId)
    .is('usado_em', null)
    .is('cancelado_em', null)
    .gt('expira_em', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function cancelarConvite(token: string): Promise<void> {
  const { error } = await supabase
    .from('convites')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('token', token);
  if (error) throw error;
}

// Entrar pelo link. Quem chega ainda não é membro, então nem o convite nem a
// fazenda aparecem para ele: a conferência toda acontece no banco.
export async function aceitarConvite(token: string): Promise<{ id: string; nome: string; jaEraMembro: boolean }> {
  const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token });
  if (error) throw error;
  const linha = (data as { id_fazenda: string; nome_fazenda: string; ja_era_membro: boolean }[])?.[0];
  if (!linha) throw new Error('Convite inválido.');
  return { id: linha.id_fazenda, nome: linha.nome_fazenda, jaEraMembro: linha.ja_era_membro };
}

export async function sairDaFazenda(fazendaId: string, userId: string): Promise<void> {
  await removerMembro(fazendaId, userId);
}

// ── Convite guardado para depois do login ────────────────────────────────────
// Quem abre o link sem estar logado precisa entrar primeiro, e a volta do login
// cai na tela inicial, sem o código. Por isso ele fica guardado no aparelho e é
// consumido assim que houver sessão (ver contexts/FazendaContext.tsx).
export const CHAVE_CONVITE = 'convite-pendente';

export async function guardarConvitePendente(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_CONVITE, token);
  } catch {
    // aparelho sem armazenamento: o convite simplesmente não fica guardado
  }
}

export async function consumirConvitePendente(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(CHAVE_CONVITE);
    if (token) await AsyncStorage.removeItem(CHAVE_CONVITE);
    return token;
  } catch {
    return null;
  }
}
