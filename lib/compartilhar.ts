import { imprimirHtml } from '@/lib/imprimir';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type ResultadoCompartilhar =
  // O PDF foi gerado e a folha de compartilhamento do sistema abriu.
  | 'compartilhado'
  // Web: não há como gerar PDF aqui sem outra biblioteca, então abrimos a
  // impressão, onde o navegador oferece "Salvar como PDF".
  | 'impressao-web'
  // Aparelho sem folha de compartilhamento disponível.
  | 'indisponivel';

// Tira do nome o que sistema de arquivos não aceita, para o PDF chegar como
// "Relatorio-Soja-2025.pdf" em vez de um hash — é esse nome que aparece no WhatsApp de
// quem recebe.
function nomeSeguro(nome: string): string {
  return nome.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'relatorio';
}

// Gera o PDF do relatório e abre a folha de compartilhamento do sistema.
//
// Na web isto não existe: printToFileAsync do expo-print também só chama
// window.print() lá (ver lib/imprimir.ts), e gerar PDF no navegador exigiria
// mais uma biblioteca. Então a web cai na impressão, onde dá para escolher
// "Salvar como PDF" e compartilhar o arquivo depois.
export async function compartilharPdf(
  html: string,
  nomeArquivo: string,
): Promise<ResultadoCompartilhar> {
  if (Platform.OS === 'web') {
    // Volta assim que o diálogo de impressão aparece, não quando ele fecha —
    // ver o resolve() em lib/imprimir.ts. É o que solta o botão na hora, em
    // vez de deixá-lo em "Gerando..." enquanto o diálogo estiver na tela.
    await imprimirHtml(html);
    return 'impressao-web';
  }

  if (!(await Sharing.isAvailableAsync())) return 'indisponivel';

  const { uri } = await Print.printToFileAsync({ html });

  // printToFileAsync devolve um arquivo temporário de nome aleatório; movemos
  // para um nome legível antes de compartilhar.
  const destino = new File(Paths.cache, `${nomeSeguro(nomeArquivo)}.pdf`);
  if (destino.exists) destino.delete();

  const gerado = new File(uri);
  await gerado.move(destino);

  await Sharing.shareAsync(destino.uri, {
    mimeType: 'application/pdf',
    // O iOS identifica o tipo por UTI, não por mimeType.
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Compartilhar relatório',
  });

  return 'compartilhado';
}
