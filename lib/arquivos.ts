import { File } from 'expo-file-system';
import { Platform } from 'react-native';

// Lê um arquivo escolhido no seletor (foto, anexo, XML) nas três plataformas.
//
// Na web o seletor devolve um blob:/data: URL, que o fetch do navegador lê. No
// celular é um file:// e o fetch do React Native não entrega bytes de forma
// confiável — por isso o File do expo-file-system (API nova do SDK 57; a antiga
// readAsStringAsync foi para expo-file-system/legacy).

export async function lerBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    return resp.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

// Base64 do arquivo, que é como o PDF viaja até o leitor (o pdf.js roda numa
// WebView/iframe, e por ali só passa texto).
export async function lerBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const lido = await new Promise<string>((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsDataURL(blob);
    });
    return lido.slice(lido.indexOf(',') + 1);
  }
  return new File(uri).base64();
}

export async function lerTexto(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    return resp.text();
  }
  return new File(uri).text();
}

// Nome seguro para o Storage: sem acento, espaço nem caractere especial, e com
// um prefixo de tempo para dois arquivos de mesmo nome não se sobrescreverem.
export function nomeParaStorage(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}_${limpo || 'arquivo'}`;
}

export function extensao(nome: string, padrao = 'jpg'): string {
  const ext = nome.split('?')[0].split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : padrao;
}
