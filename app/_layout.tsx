import { AuthProvider } from '@/contexts/AuthContext';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Root layout only wires up providers. Whether a route requires auth is
// decided by each route group itself (see app/(app)/_layout.tsx and
// app/login.tsx), which is the standard Expo Router pattern for protected
// routes and avoids fighting the router with a global redirect here.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Slot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
