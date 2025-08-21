import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';

export default function TrainingPlanScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Training Plan</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background, padding: 16 },
});

