import { View, StyleSheet, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const isAuthenticated = !!useAuthStore(s => s.user);

  return (
    <View style={styles.container}>
      <Button
        title={isAuthenticated ? 'Go to Dashboard' : 'Sign In'}
        onPress={() =>
          router.push(isAuthenticated ? '/(app)/dashboard' : '/(auth)/login')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
