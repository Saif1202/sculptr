import React from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import AppHeader from '@/components/AppHeader';
import FloatingChatButton from '@/components/FloatingChatButton';
import AIChatWidget from '@/components/AIChatWidget';
import { useMealStore } from '@/src/features/meal/store';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function AppLayout() {
  const router = useRouter();
  const overUnder = useMealStore((s) => s.overUnderStatus());

  useEffect(() => {
    if (overUnder.status === 'over' || overUnder.status === 'under') {
      // Prevent navigation away by pushing a guard screen OR you can show a modal
      // For simplicity, we push dashboard as an anchor and rely on UI messages
      router.replace('/(app)/dashboard');
    }
  }, [overUnder.status]);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="meal-plan" />
        <Stack.Screen name="training-plan" />
        <Stack.Screen name="check-in" />
        <Stack.Screen name="settings" />
      </Stack>
      <AIChatWidget />
    </View>
  );
}

