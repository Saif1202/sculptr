import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../src/lib/firebase';
import { colors } from '../src/theme';
import { ensureTargetsForUser } from '../src/lib/ensureTargets';
import { initPurchases, syncTierToFirestore } from '../src/lib/billing';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      // Ensure user document exists and has targets after login
      if (user) {
        try {
          // Initialize RevenueCat
          try {
            await initPurchases(user.uid, Platform.OS as 'ios' | 'android');
            // Sync tier from RevenueCat to Firestore
            await syncTierToFirestore(user.uid);
          } catch (error) {
            console.warn('Error initializing RevenueCat:', error);
          }
          
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            // Create minimal user document if it doesn't exist
            await setDoc(userDocRef, {
              profile: {
                email: user.email ?? '',
                tier: 'free',
              },
              targets: null,
            });
            console.log('Created minimal user document for', user.uid);
          } else {
            // Ensure targets exist for existing users
            await ensureTargetsForUser(user.uid).catch(err => {
              console.warn('Error ensuring targets:', err);
            });
          }
        } catch (error) {
          // Silently handle permission errors - rules might deny access
          console.warn('Could not ensure user document exists:', error);
        }
      }
      
      if (initializing) {
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, [initializing]);

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!user && !inAuthGroup) {
      // No user and not in auth group, redirect to login
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // User exists and in auth group, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [user, initializing, segments, router]);

  // Show loading view while auth state initializes
  if (initializing) {
    return (
      <>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.bg,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.bg,
          },
          animation: 'slide_from_right',
          animationDuration: 300,
        }}
      >
        <Stack.Screen 
          name="(auth)" 
          options={{ 
            headerShown: false,
            animation: 'fade',
            animationDuration: 200,
          }} 
        />
        <Stack.Screen 
          name="(tabs)" 
          options={{ 
            headerShown: false,
            animation: 'fade',
            animationDuration: 200,
          }} 
        />
        <Stack.Screen 
          name="chat" 
          options={{ 
            title: 'Jim',
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 350,
            gestureEnabled: true,
            gestureDirection: 'vertical',
          }} 
        />
        <Stack.Screen 
          name="paywall" 
          options={{ 
            title: 'Upgrade to Premium',
            presentation: 'modal',
            animation: 'slide_from_bottom',
            animationDuration: 350,
            gestureEnabled: true,
            gestureDirection: 'vertical',
          }} 
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

