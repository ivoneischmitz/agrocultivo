import * as Print from 'expo-print';
import { Platform } from 'react-native';

// Manda um documento HTML para a impressão do sistema.
//
// No Android e no iOS o expo-print faz isso direito. Na web, não: a
// implementação dele (ExponentPrint.web.js) **descarta o html** e chama
// window.print(), que imprime a TELA — no nosso caso o modal com os botões
// junto, e o conteúdo colado no rodapé, porque a janela é ancorada embaixo.
//
// Por isso a web tem caminho próprio: o documento vai para um iframe escondido
// e quem imprime é ele. É a técnica usual para imprimir algo diferente do que
// está na tela sem abrir uma aba (que os bloqueadores de pop-up barrariam).

// Um documento de impressão por vez na página. Antes cada chamada criava o seu
// iframe e só o removia no afterprint; imprimir duas vezes seguidas deixava o
// primeiro pendurado, e o Chrome ignora um print() novo enquanto ainda há
// impressão em andamento — o segundo diálogo não abria e ninguém avisava.
const ID_IFRAME = 'impressao-documento';

export async function imprimirHtml(html: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html });
    return;
  }

  document.getElementById(ID_IFRAME)?.remove();

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.id = ID_IFRAME;
    // Fora de vista, mas não display:none — um iframe sem caixa não renderiza
    // e sairia em branco na impressão.
    iframe.setAttribute(
      'style',
      'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;',
    );
    iframe.setAttribute('aria-hidden', 'true');

    // A limpeza corre por fora da promessa, de propósito — ver o comentário do
    // resolve() adiante.
    let limpo = false;
    let aoTerminar: (() => void) | null = null;
    const limpar = () => {
      if (limpo) return;
      limpo = true;
      if (aoTerminar) window.removeEventListener('afterprint', aoTerminar);
      iframe.remove();
    };

    iframe.onload = () => {
      const janela = iframe.contentWindow;
      if (!janela) {
        limpar();
        reject(new Error('Não foi possível preparar o documento para impressão.'));
        return;
      }

      // O afterprint cai na janela do iframe em uns navegadores e na do pai em
      // outros, então os dois escutam e o primeiro que chegar limpa.
      aoTerminar = limpar;
      janela.addEventListener('afterprint', limpar);
      window.addEventListener('afterprint', aoTerminar);

      // Rede de segurança para o navegador que não dispare nenhum dos dois.
      // Dez minutos, não um: o usuário pode demorar no diálogo escolhendo a
      // impressora, ou a pasta do "Salvar como PDF", e tirar o iframe do
      // documento no meio disso imprime em branco.
      setTimeout(limpar, 10 * 60_000);

      try {
        janela.focus();
        janela.print();
      } catch (e) {
        limpar();
        reject(e instanceof Error ? e : new Error('Não foi possível imprimir.'));
        return;
      }

      // Resolve com o diálogo ABERTO, não quando ele fecha.
      //
      // Quem chama usa este await para soltar o botão ("Gerando...", no
      // Compartilhar). Esperar o fim da impressão prendia o botão por todo o
      // tempo em que o diálogo ficasse na tela — e, quando o afterprint não
      // vinha, até o estouro do tempo. O trabalho desta função é pôr o
      // documento na frente do usuário; o que ele decide lá dentro não é
      // resposta que o botão precise esperar.
      //
      // Também não dava para distinguir impressão de cancelamento: os dois
      // disparam afterprint. Então esperar nunca informou nada de útil.
      resolve();
    };

    // srcdoc em vez de document.write: dispara o onload, então só imprimimos
    // depois do conteúdo montado.
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
