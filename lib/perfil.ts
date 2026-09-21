import { supabase } from '@/lib/supabase';

// Só o que é da pessoa. Sítio, proprietário, UF e município são da fazenda e
// moraram aqui até as fazendas compartilhadas existirem — hoje ficam em
// `fazendas`, à vista de todos os membros (ver supabase/fazendas.sql).
export type Perfil = {
  nome: string;
};

export const PERFIL_VAZIO: Perfil = { nome: '' };

export async function getPerfil(): Promise<Perfil> {
  const { data, error } = await supabase.from('perfis').select('*').maybeSingle();
  if (error) throw error;
  if (!data) return PERFIL_VAZIO;
  return { nome: data.nome ?? '' };
}

export async function salvarPerfil(perfil: Perfil): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sessão expirada. Entre novamente.');
  const { error } = await supabase.from('perfis').upsert({
    user_id: u.user.id,
    nome: perfil.nome.trim() === '' ? null : perfil.nome.trim(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export const ESTADOS = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' }, { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' }, { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' }, { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' }, { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'PA', nome: 'Pará' }, { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' }, { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' }, { uf: 'RO', nome: 'Rondônia' }, { uf: 'RR', nome: 'Roraima' },
  { uf: 'SC', nome: 'Santa Catarina' }, { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' },
];

// IBGE (gratuito, sem chave).
export async function listMunicipios(uf: string): Promise<string[]> {
  const resp = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
  );
  if (!resp.ok) throw new Error('Falha ao carregar municípios.');
  const json: { nome: string }[] = await resp.json();
  return json.map((m) => m.nome);
}
