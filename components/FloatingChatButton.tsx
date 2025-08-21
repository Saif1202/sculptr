import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';

type Props = {
  onPress?: () => void;
};

export function FloatingChatButton({ onPress }: Props) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button" accessibilityLabel="Open chat">
        <IconSymbol name="bubble.left.and.bubble.right.fill" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    zIndex: 100,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.tint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  pressed: { opacity: 0.85 },
});

export default FloatingChatButton;

