import { Directory, File, Paths } from 'expo-file-system';

// Guarda no aparelho a foto ou o anexo escolhido, para ele sobreviver até
// haver internet.
//
// O arquivo que vem do seletor ou da câmera fica numa pasta temporária, que o
// sistema limpa quando quer. Sem copiar para um lugar nosso, a foto tirada na
// lavoura poderia sumir antes de subir.

const PASTA = 'pendentes';

function pasta(): Directory {
  const d = new Directory(Paths.document, PASTA);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

// Devolve o endereço da cópia, que é o que fica guardado na fila.
export function guardarArquivo(uri: string, nome: string): string {
  const origem = new File(uri);
  const destino = new File(pasta(), `${Date.now()}_${nome.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  origem.copySync(destino);
  return destino.uri;
}

// Depois que o arquivo sobe, a cópia local não serve mais.
export function apagarArquivo(uri: string | null | undefined): void {
  if (!uri || !uri.includes(PASTA)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // arquivo já não está lá: nada a fazer
  }
}
