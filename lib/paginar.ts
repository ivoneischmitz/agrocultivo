// Leitura paginada do Supabase.
//
// O servidor devolve no máximo 1.000 linhas por consulta (max_rows do projeto)
// e não avisa quando corta: a resposta vem com status 200 e as primeiras mil.
// A pluviometria passa disso em poucas safras, e o celular simplesmente deixaria
// de baixar o resto, sem erro nenhum.
//
// Este arquivo não importa nada de propósito: assim dá para testar a lógica
// fora do aplicativo, e ela não depende de qual biblioteca fala com o servidor.

export const TAMANHO_PAGINA = 1000;

export type Pagina = {
  data: unknown[] | null;
  error: { message: string } | null;
  // Total de linhas que a consulta tem, vindo do servidor (count: 'exact').
  count: number | null;
};

// `buscar` recebe o intervalo (de, ate) e devolve uma página. A ordem tem que
// ser por uma coluna que não muda — o id. Ordenar por updated_at faria uma
// linha alterada no meio da descida mudar de lugar, e a seguinte seria pulada.
// Pelo id, o pior que acontece é ler uma linha duas vezes.
//
// O fim é decidido pelo total que o servidor informa, e não por "veio menos
// que o pedido": se o limite do projeto for menor que o tamanho da página, a
// regra do tamanho pararia cedo demais — o mesmo defeito, disfarçado.
export async function lerPaginado(
  buscar: (de: number, ate: number) => PromiseLike<Pagina>,
  aoReceber: (linhas: Record<string, unknown>[]) => void,
  tamanho = TAMANHO_PAGINA,
): Promise<number> {
  let lidas = 0;
  for (;;) {
    const { data, error, count } = await buscar(lidas, lidas + tamanho - 1);
    if (error) throw error;

    const linhas = (data ?? []) as Record<string, unknown>[];
    if (linhas.length > 0) aoReceber(linhas);
    lidas += linhas.length;

    if (linhas.length === 0) return lidas;
    if (count !== null) {
      if (lidas >= count) return lidas;
    } else if (linhas.length < tamanho) {
      // Sem total informado, não há outro critério.
      return lidas;
    }
  }
}
