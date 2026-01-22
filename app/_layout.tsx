import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../src/lib/firebase';
import { colors } from '../src/theme';
import { ensureTargetsForUser } from '../src/lib/ensureTargets';
import { initPurchases, syncTierToFirestore } from '../src/lib/billing';
import Logo from '../src/components/Logo';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const scaleAnim = useRef(new Animated.Value(1.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start burst fade animation
    Animated.sequence([
      // Burst in: scale from 1.5 to 1 with bounce, fade in
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Hold for a moment
      Animated.delay(300),
      // Fade out
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

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
          <Animated.View
            style={[
              styles.logoContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            <Logo size={120} />
          </Animated.View>
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
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

