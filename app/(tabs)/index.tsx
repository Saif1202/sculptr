import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { useAuthStore } from '@/store/auth';

export default function HomeScreen() {
  const router = useRouter();
  const isAuthenticated = !!useAuthStore(s => s.user);

  return (
    <View style={styles.container} pointerEvents="auto">
      <Pressable
        onPress={() => router.push(isAuthenticated ? '/(app)/dashboard' : '/(auth)/login')}
        style={styles.cta}
      >
        <ThemedText type="defaultSemiBold">
          {isAuthenticated ? 'Go to Dashboard' : 'Sign In'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  cta: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
    cursor: 'pointer', // web-only style works in RN Web
  },
});
