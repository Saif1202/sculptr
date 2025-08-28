import { StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuthStore } from '@/store/auth';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = !!user;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Sculptr</ThemedText>
      <ThemedText style={styles.subtitle}>
        {isAuthenticated ? 'Welcome back!' : 'Sign in to get started'}
      </ThemedText>

      <Pressable
        onPress={() => router.push(isAuthenticated ? '/(app)/dashboard' : '/(auth)/login')}
        style={styles.cta}
      >
        <ThemedText type="defaultSemiBold">
          {isAuthenticated ? 'Go to Dashboard' : 'Sign In'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  subtitle: { opacity: 0.8 },
  cta: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
