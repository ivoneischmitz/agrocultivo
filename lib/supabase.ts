import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project credentials.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // AsyncStorage works on native; on web Supabase falls back to localStorage
    // automatically when storage is unavailable, but we pass it explicitly so
    // sessions persist consistently across iOS, Android and Web.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Na web o link de "Esqueci minha senha" volta para /nova-senha com o
    // token na URL; é isto que o transforma em sessão. No celular não há URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
