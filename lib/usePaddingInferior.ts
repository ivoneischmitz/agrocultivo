import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Padding de baixo para as janelas que sobem do rodapé (os Modal com o
// conteúdo ancorado embaixo).
//
// No Android o app é desenhado de ponta a ponta, por baixo da barra de
// navegação do sistema — o Expo SDK 57 liga isso sempre. Uma janela colada no
// rodapé com padding fixo deixava os botões dela (Salvar, Fechar) atrás dos
// botões voltar/início, sem como tocar. Somar a altura dessa barra ao padding
// empurra o conteúdo para cima dela. Onde não há barra (web, iOS sem gesto),
// o valor é zero e nada muda.
//
// Recebe o padding que a janela já tinha para não repetir o número em dois
// lugares e deixar os dois se desencontrarem.
export function usePaddingInferior(base: number) {
  const insets = useSafeAreaInsets();
  return { paddingBottom: base + insets.bottom };
}
