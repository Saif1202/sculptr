import React from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import AppHeader from '@/components/AppHeader';
import FloatingChatButton from '@/components/FloatingChatButton';

export default function AppLayout() {
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
      <FloatingChatButton onPress={() => { /* hook to chat later */ }} />
    </View>
  );
}

