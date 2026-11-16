import { Botao, Cartao } from '@/components/ui';
import { buscarApkPublicado, type ApkPublicado } from '@/lib/apk';
import { formatDataBR } from '@/lib/data';
import { cores } from '@/lib/tema';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

// "Baixar o aplicativo para Android", no site.
//
// Só aparece na web (no aplicativo já instalado seria um botão para baixar o
// que se está usando), só quando há um APK publicado (ver lib/apk.ts) e não
// no iPhone, que não instala APK.
//
//   login   dentro do cartão de entrada, com uma linha separando dos links.
//   cartao  como cartão próprio, para a tela de Perfil.
export function BaixarApk({ variante }: { variante: 'login' | 'cartao' }) {
  const [apk, setApk] = useState<ApkPublicado | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || ehIphone()) return;
    let vivo = true;
    void buscarApkPublicado().then((a) => {
      if (vivo) setApk(a);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (Platform.OS !== 'web' || !apk) return null;

  const detalhes = [apk.versao, apk.data && formatDataBR(apk.data), `${apk.tamanhoMb.toFixed(0)} MB`]
    .filter(Boolean)
    .join(' · ');

  const conteudo = (
    <>
      <Text style={styles.titulo}>📱 Aplicativo para Android</Text>
      <Text style={styles.detalhes}>{detalhes}</Text>
      <Botao titulo="⬇️ Baixar o aplicativo" contorno={variante === 'login'} onPress={() => void Linking.openURL(apk.url)} />
      <Text style={styles.nota}>
        Depois de baixar, toque no arquivo para instalar. O Android vai pedir para permitir a
        instalação de aplicativos vindos deste navegador: é normal, o aplicativo não é da Play
        Store.
      </Text>
    </>
  );

  return variante === 'login' ? <View style={styles.login}>{conteudo}</View> : <Cartao>{conteudo}</Cartao>;
}

function ehIphone(): boolean {
  const ua = typeof navigator !== 'undefined' ? (navigator as { userAgent?: string }).userAgent : '';
  return /iPhone|iPad|iPod/i.test(ua ?? '');
}

const styles = StyleSheet.create({
  login: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: cores.borda },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto, marginBottom: 2 },
  detalhes: { fontSize: 13, color: cores.textoSecundario, marginBottom: 10 },
  nota: { fontSize: 12, color: cores.textoSecundario, marginTop: 10, lineHeight: 17 },
});
