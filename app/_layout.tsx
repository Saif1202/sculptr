import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { requestNotificationPermissions } from '@/utils';
import { scheduleDailyWeightReminderIfNeeded } from '@/utils/weightReminders';
import { StripeProvider } from '@stripe/stripe-react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = !!user;
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  const midnightTheme = {
    dark: true,
    colors: {
      primary: Colors.dark.tint,
      background: Colors.dark.background,
      card: '#0F1A35',
      text: Colors.dark.text,
      border: '#142042',
      notification: Colors.dark.tint,
    },
  } as const;

  // Redirect between auth/app routes based on authentication
  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)/dashboard');
    }
  }, [isHydrated, isAuthenticated, segments.join(':')]);

  // Schedule weight reminder on app start and auth state changes
  useEffect(() => {
    (async () => {
      if (isAuthenticated && user?.uid) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleDailyWeightReminderIfNeeded(user.uid);
        }
      }
    })();
  }, [isAuthenticated]);

  return (
    <ThemeProvider value={midnightTheme}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="light" />
      </StripeProvider>
    </ThemeProvider>
  );
}
