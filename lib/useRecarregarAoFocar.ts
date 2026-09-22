import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

// Roda a função toda vez que a tela ganha foco, inclusive na primeira.
//
// É o que mantém as listas frescas. As abas do menu continuam montadas depois
// da primeira visita, então um efeito de montagem roda uma vez e nunca mais:
// o que foi gravado em outro aparelho — ou na web, com o celular aberto ao
// lado — só apareceria reiniciando o app.
//
// A função fica numa ref e o efeito de foco não depende dela. Sem isso, as
// telas de filtro (que reconstroem a sua a cada tecla digitada) dispararia uma
// consulta por tecla, que foi justamente o motivo de elas terem nascido com
// dependências vazias.
// `chave` faz recarregar também quando ela muda com a tela já aberta. É o caso
// da fazenda: o contexto a descobre depois do primeiro desenho, e sem isso a
// tela ficaria esperando para sempre, porque o foco não muda mais.
export function useRecarregarAoFocar(recarregar: () => void, chave?: unknown) {
  const ref = useRef(recarregar);

  useEffect(() => {
    ref.current = recarregar;
  });

  useFocusEffect(
    useCallback(() => {
      ref.current();
    }, [chave]),
  );
}
