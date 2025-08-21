import React, { useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import FloatingChatButton from './FloatingChatButton';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/lib/firebase';
import { useAuthStore } from '@/store/auth';

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user'|'assistant'; text: string }[]>([]);
  const slide = useRef(new Animated.Value(0)).current;
  const user = useAuthStore(s => s.user);

  const toggle = () => {
    setOpen((v) => !v);
    Animated.timing(slide, { toValue: open ? 0 : 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const send = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    try {
      const call = httpsCallable(functions, 'proxyAIChat');
      const tier: 'free'|'premium' = 'free'; // TODO: read from subscription doc
      const res = await call({ prompt: q, tier });
      const text = (res.data as any)?.text ?? 'No response';
      setMessages((m) => [...m, { role: 'assistant', text }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', text: e.message ?? 'Error' }]);
    }
  };

  const translateY = slide.interpolate({ inputRange: [0,1], outputRange: [300, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <FloatingChatButton onPress={toggle} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.header}>
            <ThemedText type="subtitle">AI Assistant</ThemedText>
            <Pressable onPress={toggle}><ThemedText style={{ color: Colors.dark.tint }}>Close</ThemedText></Pressable>
          </View>
          <View style={styles.messages}>
            {messages.map((m, idx) => (
              <View key={idx} style={[styles.bubble, m.role === 'user' ? styles.user : styles.assistant]}>
                <ThemedText>{m.text}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput value={input} onChangeText={setInput} placeholder="Ask anything..." placeholderTextColor="#8492A6" style={styles.input} />
            <Pressable onPress={send} style={styles.send}><ThemedText>Send</ThemedText></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 320,
    backgroundColor: '#0F1A35',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#142042',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  messages: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
  },
  user: { alignSelf: 'flex-end', backgroundColor: Colors.dark.tint },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#0A1124', borderWidth: 1, borderColor: '#142042' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: { flex: 1, backgroundColor: '#0A1124', color: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#142042' },
  send: { backgroundColor: Colors.dark.tint, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
});

