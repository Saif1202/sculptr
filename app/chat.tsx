import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, increment } from 'firebase/firestore';
import { auth, db } from '../src/lib/firebase';
import { colors } from '../src/theme';
import { callChatCoach, ChatMessage } from '../src/lib/functions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayISO } from '../src/utils/date';

interface UserData {
  profile?: {
    tier?: 'free' | 'premium';
    [key: string]: any;
  };
  targets?: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatsG?: number;
  };
}

export default function ChatScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m Jim, your fitness coach. How can I help you today?',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const tier = userData?.profile?.tier || 'free';
  const insets = useSafeAreaInsets();
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [chatLimit, setChatLimit] = useState(10); // 10 messages per day for free users

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserData;
          setUserData(data);
        }
      },
      (err) => {
        console.warn('Error loading user data:', err);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load daily chat count
  useEffect(() => {
    if (!user || tier === 'premium') {
      setChatCount(0);
      return;
    }

    const loadChatCount = async () => {
      try {
        const today = todayISO();
        const usageDocRef = doc(db, 'users', user.uid, 'chatUsage', today);
        const usageDoc = await getDoc(usageDocRef);
        
        if (usageDoc.exists()) {
          const data = usageDoc.data();
          setChatCount(data?.count || 0);
        } else {
          setChatCount(0);
        }
      } catch (error) {
        console.warn('Error loading chat count:', error);
        setChatCount(0);
      }
    };

    loadChatCount();
  }, [user, tier]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    
    if (!user) {
      Alert.alert('Error', 'Please log in to chat with Jim');
      return;
    }

    // Check chat limit for free users
    if (tier === 'free' && chatCount >= chatLimit) {
      Alert.alert(
        'Daily Limit Reached',
        `You've used all ${chatLimit} free messages today. Upgrade to Premium for unlimited messages!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
    };

    // Add user message to local state
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setSending(true);

    try {
      // Prepare messages for API (exclude system messages, only user and assistant)
      const apiMessages: ChatMessage[] = [
        ...messages.filter(m => m.role !== 'system'),
        userMessage,
      ];

      // Call the chat coach function
      const response = await callChatCoach({
        messages: apiMessages,
        tier,
        profile: userData?.profile,
        targets: userData?.targets,
      });

      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Increment chat count for free users
      if (tier === 'free') {
        try {
          const today = todayISO();
          const usageDocRef = doc(db, 'users', user.uid, 'chatUsage', today);
          const currentDoc = await getDoc(usageDocRef);
          
          if (currentDoc.exists()) {
            // Document exists, use increment
            await setDoc(usageDocRef, {
              count: increment(1),
              date: today,
            }, { merge: true });
          } else {
            // Document doesn't exist, create with count 1
            await setDoc(usageDocRef, {
              count: 1,
              date: today,
            });
          }
          setChatCount((prev) => prev + 1);
        } catch (error) {
          console.warn('Error updating chat count:', error);
          // Don't block the user if count update fails, but still track locally
          setChatCount((prev) => prev + 1);
        }
      }
    } catch (error: any) {
      console.error('Chat error details:', error);
      const errorMessage = error.message || 'Failed to send message. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setSending(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (event) => {
      const height = event.endCoordinates.height - insets.bottom;
      setKeyboardOffset(height > 0 ? height : 0);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const refreshScroll = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={styles.flex}>
          {tier !== 'premium' && (
            <View style={styles.notice}>
              <View style={styles.noticeContent}>
                <View style={styles.noticeTextContainer}>
                  <Text style={styles.noticeText}>
                    Lite mode — {chatCount >= chatLimit ? 'Daily limit reached' : `${chatLimit - chatCount} messages left today`}
                  </Text>
                  {chatCount >= chatLimit && (
                    <Text style={styles.noticeSubtext}>
                      Upgrade for unlimited messages
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => router.push('/paywall')}
                >
                  <Text style={styles.upgradeButtonText}>Upgrade</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.message,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <Text style={styles.messageText}>{message.content}</Text>
              </View>
            ))}
            {sending && (
              <View style={[styles.message, styles.assistantMessage]}>
                <ActivityIndicator size="small" color={colors.textDim} />
        </View>
            )}
      </ScrollView>
        </View>
      
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              bottom: insets.bottom + keyboardOffset,
            },
          ]}
        >
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.textDim}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            editable={!sending}
            returnKeyType="send"
            multiline
            blurOnSubmit={false}
            onFocus={refreshScroll}
        />
          <TouchableOpacity
            style={[styles.sendButton, (sending || !inputText.trim() || (tier === 'free' && chatCount >= chatLimit)) && styles.sendButtonDisabled]}
            onPress={() => {
              handleSend();
            }}
            disabled={sending || !inputText.trim() || (tier === 'free' && chatCount >= chatLimit)}
          >
            {sending ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
          <Text style={styles.sendButtonText}>Send</Text>
            )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  notice: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: 12,
    paddingTop: 20,
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeTextContainer: {
    flex: 1,
  },
  noticeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeSubtext: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
  upgradeButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 140,
  },
  message: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: colors.accent,
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    alignItems: 'flex-end',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginRight: 12,
    maxHeight: 120,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
