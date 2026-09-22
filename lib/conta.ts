import { supabase } from '@/lib/supabase';

// Exclusão da conta pela própria pessoa — exigência da Play Store para
// aplicativos com cadastro, e o mínimo decente de qualquer forma.
//
// A decisão difícil é o que fazer com fazenda compartilhada: os dados também
// são do sócio. A regra está em supabase/excluir-conta.sql — fazenda em que a
// pessoa está sozinha é apagada inteira; fazenda com mais gente continua, e
// ela apenas sai.

export type ResumoExclusao = {
  fazendas_apagadas: number;
  fazendas_que_ficam: number;
  cultivos_apagados: number;
};

export async function resumoExclusao(): Promise<ResumoExclusao> {
  const { data, error } = await supabase.rpc('resumo_exclusao');
  if (error) throw error;
  const linha = (data as ResumoExclusao[])?.[0];
  return linha ?? { fazendas_apagadas: 0, fazendas_que_ficam: 0, cultivos_apagados: 0 };
}

export async function excluirMinhaConta(): Promise<void> {
  const { error } = await supabase.rpc('excluir_minha_conta');
  if (error) throw error;
  // A conta já não existe; a sessão guardada no aparelho precisa ir junto.
  await supabase.auth.signOut().catch(() => {});
}
