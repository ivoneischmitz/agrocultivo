import * as Location from 'expo-location';
import { Platform } from 'react-native';

// Clima atual e previsão (Open-Meteo, gratuito e sem chave) na posição do
// aparelho. Na web a posição vem do navegador, que pede permissão.

export type Clima = {
  cidade: string | null;
  temperatura: number;
  codigo: number;
  dias: { data: string; codigo: number; max: number; min: number }[];
};

export function iconeClima(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

export function descricaoClima(code: number): string {
  if (code === 0) return 'Céu limpo';
  if (code === 1 || code === 2) return 'Poucas nuvens';
  if (code === 3) return 'Nublado';
  if (code >= 45 && code <= 48) return 'Neblina';
  if (code >= 51 && code <= 67) return 'Chuvoso';
  if (code >= 71 && code <= 77) return 'Neve';
  if (code >= 80 && code <= 82) return 'Pancadas de chuva';
  if (code >= 95) return 'Tempestade';
  return 'Tempo instável';
}

const CHUVA = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82];
const TEMPESTADE = [95, 96, 99];

export function alertaClima(clima: Clima): { titulo: string; mensagem: string; urgente: boolean } | null {
  const hoje = clima.dias[0]?.codigo;
  const amanha = clima.dias[1]?.codigo;
  if (TEMPESTADE.includes(hoje))
    return { titulo: '⚠️ Alerta de Tempestade!', mensagem: 'Risco de tempestade hoje. Proteja seus equipamentos.', urgente: true };
  if (CHUVA.includes(hoje))
    return { titulo: '🌧️ Chuva para Hoje', mensagem: 'Há previsão de chuva para hoje. Planeje suas atividades.', urgente: true };
  if (TEMPESTADE.includes(amanha))
    return { titulo: '🌩️ Tempestade Amanhã', mensagem: 'Previsão de tempestade para amanhã. Fique atento.', urgente: false };
  if (CHUVA.includes(amanha))
    return { titulo: '🌦️ Chuva Amanhã', mensagem: 'Pode chover amanhã. Considere isso no seu planejamento.', urgente: false };
  return null;
}

export async function posicaoAtual(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const ultima = Platform.OS === 'web' ? null : await Location.getLastKnownPositionAsync({});
  const pos = ultima ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
}

// reverseGeocode só existe no Android/iOS; na web a cidade fica em branco.
export async function nomeDoLugar(latitude: number, longitude: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const [end] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!end) return null;
    const cidade = end.city || end.subregion || end.district;
    if (!cidade) return null;
    return end.region ? `${cidade} - ${end.region}` : cidade;
  } catch {
    return null;
  }
}

export async function buscarClima(): Promise<Clima | null> {
  const pos = await posicaoAtual();
  if (!pos) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${pos.latitude}&longitude=${pos.longitude}` +
    '&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto';
  const [resp, cidade] = await Promise.all([fetch(url), nomeDoLugar(pos.latitude, pos.longitude)]);
  const json = await resp.json();
  if (!json.current_weather) return null;
  return {
    cidade,
    temperatura: json.current_weather.temperature,
    codigo: json.current_weather.weathercode,
    dias: (json.daily?.time ?? []).map((d: string, i: number) => ({
      data: d,
      codigo: json.daily.weathercode[i],
      max: json.daily.temperature_2m_max[i],
      min: json.daily.temperature_2m_min[i],
    })),
  };
}
