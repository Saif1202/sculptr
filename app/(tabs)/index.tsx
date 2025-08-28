import { View, Button, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const isAuthed = !!useAuthStore(s => s.user);
  return (
    <View style={styles.container}>
      <Button
        title={isAuthed ? 'Go to Dashboard' : 'Sign In'}
        onPress={() => router.push(isAuthed ? '/(app)/dashboard' : '/(auth)/login')}
      />
    </View>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', alignItems: 'center' } });
