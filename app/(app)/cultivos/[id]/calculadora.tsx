import { Botao, Campo, Cartao, Carregando } from '@/components/ui';
import { paraCampo, parseNumeroLivre } from '@/lib/formatar';
import { cores } from '@/lib/tema';
import { useCultivo } from '@/lib/useCultivo';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

// Quanto de semente comprar para a área do cultivo.
//
// Soja e milho: plantas por metro linear × metros lineares da área
// (10.000 m² / espaçamento entre linhas, por hectare). Trigo e demais:
// dose em kg/ha × área.
export default function CalculadoraScreen() {
  const { cultivoId, cultivo } = useCultivo();
  if (!cultivo) return <Carregando />;
  return <Calculadora key={cultivo.id} cultivoId={cultivoId} cultura={cultivo.nome_cultura} areaInicial={cultivo.area_hectares} />;
}

function Calculadora({ cultivoId, cultura, areaInicial }: { cultivoId: number; cultura: string; areaInicial: number }) {
  const [area, setArea] = useState(paraCampo(areaInicial));
  const [dose, setDose] = useState('');
  const [espacamento, setEspacamento] = useState('0,45');

  const porLinha = /soja|milho/i.test(cultura);
  const a = parseNumeroLivre(area);
  const d = parseNumeroLivre(dose);
  const e = parseNumeroLivre(espacamento);

  let total = 0;
  let texto = '';
  if (a > 0 && d > 0) {
    if (porLinha && e > 0) {
      total = (10_000 / e) * a * d;
      texto = `${Math.round(total).toLocaleString('pt-BR')} sementes\n(${(total / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} milhões)`;
    } else if (!porLinha) {
      total = a * d;
      texto = `${total.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg no total`;
    }
  }

  function gerarDespesa() {
    const q = porLinha ? Math.round(total) : Number(total.toFixed(2));
    router.push(
      `/cultivos/${cultivoId}/movimentacao?tipo=DESPESA&cat=Sementes&desc=${encodeURIComponent(
        'Compra de semente (calculado)',
      )}&qtd=${encodeURIComponent(paraCampo(q))}` as Href,
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>🌱 {cultura}</Text>
      <Cartao>
        <Campo label="📏 Área do cultivo (hectares)" keyboardType="decimal-pad" value={area} onChangeText={setArea} placeholder="Ex: 10" />
        <Campo
          label={porLinha ? '🌱 Plantas por metro linear' : '📦 Dose recomendada (kg/ha)'}
          keyboardType="decimal-pad"
          value={dose}
          onChangeText={setDose}
          placeholder={porLinha ? 'Ex: 15' : 'Ex: 350'}
        />
        {porLinha && (
          <Campo
            label="↔️ Espaçamento entre linhas (metros)"
            keyboardType="decimal-pad"
            value={espacamento}
            onChangeText={setEspacamento}
            placeholder="Ex: 0,45"
          />
        )}
      </Cartao>

      {texto ? (
        <Cartao style={{ backgroundColor: cores.primariaClara, borderColor: '#a5d6a7', alignItems: 'center' }}>
          <Text style={styles.rotulo}>Necessidade total estimada</Text>
          <Text style={styles.resultado}>{texto}</Text>
          <Botao titulo="💰 Gerar despesa com este cálculo" onPress={gerarDespesa} style={{ marginTop: 12, alignSelf: 'stretch' }} />
        </Cartao>
      ) : (
        <Text style={styles.dica}>Preencha a área e a dose para ver o cálculo.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, maxWidth: 700, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 18, fontWeight: '800', color: cores.texto, marginBottom: 12 },
  rotulo: { color: cores.textoSecundario },
  resultado: { fontSize: 22, fontWeight: '800', color: cores.primariaEscura, textAlign: 'center', marginTop: 6 },
  dica: { color: cores.textoSecundario, textAlign: 'center', marginTop: 8 },
});
