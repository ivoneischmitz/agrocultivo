// Último APK publicado, lido dos Releases do GitHub.
//
// O arquivo mora nos Releases, e não no site nem no EAS: o link de download do
// EAS é temporário (gerado a cada pedido) e os builds de lá expiram; botar um
// APK de 100 MB no repositório ou na Vercel pesaria no Git para sempre a cada
// versão. O Release tem endereço fixo, aceita arquivo grande e é de graça.
//
// O site pergunta ao GitHub qual é o último e só mostra o botão se achar um.
// Assim não existe link quebrado antes do primeiro Release, e uma versão nova
// aparece sozinha, sem publicar o site de novo.

const REPOSITORIO = 'ivoneischmitz/agrocultivo';

export type ApkPublicado = {
  url: string;
  versao: string;
  tamanhoMb: number;
  // AAAA-MM-DD
  data: string;
};

export async function buscarApkPublicado(): Promise<ApkPublicado | null> {
  try {
    // /releases/latest ignora rascunhos e pré-lançamentos: o Release precisa ter
    // sido PUBLICADO. Sem credencial o GitHub deixa 60 consultas por hora por
    // IP, muito além do uso daqui; se estourar, o botão só some.
    const r = await fetch(`https://api.github.com/repos/${REPOSITORIO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null; // 404: ainda não há Release publicado
    const release = (await r.json()) as {
      tag_name?: string;
      published_at?: string;
      assets?: { name: string; size: number; browser_download_url: string; updated_at?: string }[];
    };
    const apk = (release.assets ?? []).find((a) => /\.apk$/i.test(a.name));
    if (!apk) return null;
    return {
      url: apk.browser_download_url,
      versao: release.tag_name ?? '',
      // 1 MB = 1.000.000 de bytes, como o celular mostra no download.
      tamanhoMb: apk.size / 1_000_000,
      data: (apk.updated_at ?? release.published_at ?? '').slice(0, 10),
    };
  } catch {
    return null;
  }
}
