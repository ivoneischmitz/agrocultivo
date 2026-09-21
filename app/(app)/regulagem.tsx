import { SelectField } from '@/components/SelectField';
import { Campo, Cartao } from '@/components/ui';
import { parseNumeroLivre } from '@/lib/formatar';
import { cores } from '@/lib/tema';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Regulagem da semeadeira: quantos gramas de semente devem cair por metro de
// linha e quanto deve pesar a semente recolhida no teste de campo.
//
// Veio do app "Regulagem de Plantio" (C:\Utilitarios\AppRegulagem), que era um
// HTML solto empacotado com Capacitor. A conta é a mesma; o que mudou foi a
// casca: componentes daqui, cálculo ao vivo (sem botão "calcular") e sem os
// anúncios do AdMob, que pertenciam àquele projeto.
//
// É diferente da Calculadora de sementes do cultivo, que responde "quanto
// comprar para a área". Esta responde "como regular a máquina".

const AREAS = [
  { valor: '24200', label: 'Alqueire (24.200 m²)' },
  { valor: '10000', label: 'Hectare (10.000 m²)' },
];

export default function RegulagemScreen() {
  const [area, setArea] = useState('24200');
  const [espacamento, setEspacamento] = useState('17');
  const [quilos, setQuilos] = useState('300');
  const [metrosTeste, setMetrosTeste] = useState('10');

  const areaM2 = Number(area);
  const cm = parseNumeroLivre(espacamento);
  const kg = parseNumeroLivre(quilos);
  const metros = parseNumeroLivre(metrosTeste);

  const calculou = cm > 0 && kg > 0 && metros > 0;
  // Metros de linha na área = área ÷ espaçamento (em metros).
  const metrosDeLinha = calculou ? areaM2 / (cm / 100) : 0;
  const gramasPorMetro = calculou ? (kg * 1000) / metrosDeLinha : 0;
  const pesoDoTeste = gramasPorMetro * metros;

  const n = (v: number, casas: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Cartao>
        <SelectField label="📐 Unidade de área" opcoes={AREAS} valor={area} onChange={setArea} />
        <Campo
          label="↔️ Largura entre linhas (cm)"
          placeholder="Ex: 17, 20, 45"
          keyboardType="decimal-pad"
          value={espacamento}
          onChangeText={setEspacamento}
        />
        <Campo
          label="🌾 Quilos de semente por essa área"
          placeholder="Ex: 300"
          keyboardType="decimal-pad"
          value={quilos}
          onChangeText={setQuilos}
        />
        <Campo
          label="📏 Distância do teste prático (metros)"
          placeholder="Ex: 10"
          keyboardType="decimal-pad"
          value={metrosTeste}
          onChangeText={setMetrosTeste}
        />
      </Cartao>

      {calculou ? (
        <>
          <Cartao style={styles.resultado}>
            <Text style={styles.titulo}>Resultado da regulagem</Text>
            <Linha rotulo="Espaçamento" valor={`${n(cm, 0)} cm`} />
            <Linha rotulo="Metros de linha na área" valor={`${n(metrosDeLinha, 0)} m`} />
            <Linha rotulo="Semente por metro linear" valor={`${n(gramasPorMetro, 2)} g/m`} destaque />
          </Cartao>

          <Cartao style={styles.teste}>
            <Text style={styles.titulo}>Teste prático</Text>
            <Text style={styles.explicacao}>
              Pese o saquinho de uma linha depois de andar {n(metros, 0)} metros. O peso deve ser de:
            </Text>
            <Text style={styles.peso}>{n(pesoDoTeste, 1)} g</Text>
          </Cartao>
        </>
      ) : (
        <Text style={styles.dica}>Preencha o espaçamento, os quilos e a distância do teste.</Text>
      )}
    </ScrollView>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <Text style={[styles.valor, destaque && styles.valorDestaque]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, maxWidth: 700, width: '100%', alignSelf: 'center' },
  resultado: { backgroundColor: cores.alertaClara, borderColor: '#ffcc80' },
  teste: { backgroundColor: cores.primariaClara, borderColor: '#a5d6a7', alignItems: 'center' },
  titulo: { fontSize: 16, fontWeight: '800', color: cores.texto, marginBottom: 10 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  rotulo: { color: cores.textoSecundario, flexShrink: 1 },
  valor: { fontWeight: '700', color: cores.texto },
  valorDestaque: { fontSize: 20, fontWeight: '800', color: '#d84315' },
  explicacao: { color: cores.textoSecundario, textAlign: 'center' },
  peso: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, marginTop: 6 },
  dica: { color: cores.textoSecundario, textAlign: 'center', marginTop: 8 },
});
