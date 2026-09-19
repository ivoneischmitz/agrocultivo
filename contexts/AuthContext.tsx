import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

// Mesmo desenho do Força de Vendas (um contexto só, lido pelo login e pelo
// portão do grupo (app)), com uma diferença de propósito: aqui o cadastro é
// aberto. Cada conta enxerga só os próprios dados (RLS por user_id em
// supabase/schema.sql), então ter conta não dá acesso a nada de ninguém.
type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  // true quando a sessão veio de um link de "Esqueci minha senha": a tela
  // nova-senha usa isso para pedir a senha nova antes de liberar o app.
  isRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ precisaConfirmar: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Para onde o e-mail de recuperação manda. Na web é o próprio site; no
// celular não há página para abrir, então vai para o site publicado.
function urlNovaSenha(): string | undefined {
  const base = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_SITE_URL;
  return base ? `${base.replace(/\/$/, '')}/nova-senha` : undefined;
}

// Mensagens do Supabase em português, nas situações que o usuário de fato vê.
export function traduzirErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('Network request failed') || msg.includes('Failed to fetch'))
    return 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (msg.includes('already registered')) return 'Este e-mail já está em uso.';
  if (msg.includes('valid email') || msg.includes('invalid format')) return 'E-mail inválido.';
  if (msg.includes('at least 6')) return 'A senha deve ter no mínimo 6 caracteres.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg || 'Ocorreu um erro.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      if (event === 'SIGNED_OUT') setIsRecovery(false);
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    session,
    isLoading,
    isRecovery,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // Com confirmação de e-mail ligada no projeto, não vem sessão.
      return { precisaConfirmar: !data.session };
    },
    resetPassword: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlNovaSenha() });
      if (error) throw error;
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsRecovery(false);
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
