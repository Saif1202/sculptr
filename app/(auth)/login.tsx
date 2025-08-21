import React from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Colors } from '@/constants/Colors';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof LoginSchema>;

export default function LoginScreen() {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginValues) => {
    // TODO: wire to auth store + firebase
    console.log('login', data);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="title">Welcome back</ThemedText>
      <TextInput
        placeholder="Email"
        placeholderTextColor="#8492A6"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        onChangeText={(t) => setValue('email', t)}
        {...register('email')}
      />
      {errors.email && <ThemedText style={styles.error}>{errors.email.message}</ThemedText>}
      <TextInput
        placeholder="Password"
        placeholderTextColor="#8492A6"
        secureTextEntry
        style={styles.input}
        onChangeText={(t) => setValue('password', t)}
        {...register('password')}
      />
      {errors.password && <ThemedText style={styles.error}>{errors.password.message}</ThemedText>}

      <Pressable onPress={handleSubmit(onSubmit)} style={styles.button} disabled={isSubmitting}>
        <ThemedText style={styles.buttonText}>Sign in</ThemedText>
      </Pressable>

      <Link href="/(auth)/signup">
        <ThemedText style={{ color: Colors.dark.tint, marginTop: 12 }}>Create an account</ThemedText>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#0F1A35',
    color: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderColor: '#142042',
    borderWidth: 1,
  },
  button: {
    backgroundColor: Colors.dark.tint,
    padding: 14,
    alignItems: 'center',
    borderRadius: 10,
    marginTop: 8,
  },
  buttonText: { color: '#0A1124', fontWeight: '600' },
  error: { color: '#FF6B6B' },
});

