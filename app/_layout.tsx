import { ThemeProvider, Theme } from '@react-navigation/native';
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
import { StripeProvider } from '@/components/StripeProvider';

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

  const midnightTheme: Theme = {
    dark: true,
    colors: {
      primary: Colors.dark.tint,
      background: Colors.dark.background,
      card: '#0F1A35',
      text: Colors.dark.text,
      border: '#142042',
      notification: Colors.dark.tint,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };

  // Redirect between auth/app routes based on authentication
  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)/dashboard');
    }
  }, [isHydrated, isAuthenticated, router, segments]);

  // Schedule weight reminder on app start and auth state changes
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted && isAuthenticated && user?.uid) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleDailyWeightReminderIfNeeded(user.uid);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.uid]);

  return (
    <ThemeProvider value={midnightTheme}>
      {loaded ? (
        <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}>
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </StripeProvider>
      ) : null}
    </ThemeProvider>
  );
}
