import React from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SignupSchema, SignupValues } from '@/schemas/auth';
import { Colors } from '@/constants/Colors';

// schema/types imported

export default function SignupScreen() {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<SignupValues>({
    resolver: zodResolver(SignupSchema),
  });

  const onSubmit = async (data: SignupValues) => {
    // TODO: wire to auth store + firebase
    console.log('signup', data);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="title">Create your account</ThemedText>
      <TextInput placeholder="First name" placeholderTextColor="#8492A6" style={styles.input} onChangeText={(t) => setValue('firstName', t)} {...register('firstName')} />
      {errors.firstName && <ThemedText style={styles.error}>{errors.firstName.message}</ThemedText>}
      <TextInput placeholder="Last name" placeholderTextColor="#8492A6" style={styles.input} onChangeText={(t) => setValue('lastName', t)} {...register('lastName')} />
      {errors.lastName && <ThemedText style={styles.error}>{errors.lastName.message}</ThemedText>}
      <TextInput placeholder="Email" placeholderTextColor="#8492A6" keyboardType="email-address" autoCapitalize="none" style={styles.input} onChangeText={(t) => setValue('email', t)} {...register('email')} />
      {errors.email && <ThemedText style={styles.error}>{errors.email.message}</ThemedText>}
      <TextInput placeholder="Password" placeholderTextColor="#8492A6" secureTextEntry style={styles.input} onChangeText={(t) => setValue('password', t)} {...register('password')} />
      {errors.password && <ThemedText style={styles.error}>{errors.password.message}</ThemedText>}
      <TextInput placeholder="DOB (YYYY-MM-DD)" placeholderTextColor="#8492A6" style={styles.input} onChangeText={(t) => setValue('dob', t)} {...register('dob')} />
      {errors.dob && <ThemedText style={styles.error}>{errors.dob.message}</ThemedText>}

      <Pressable onPress={handleSubmit(onSubmit)} style={styles.button} disabled={isSubmitting}>
        <ThemedText style={styles.buttonText}>Sign up</ThemedText>
      </Pressable>
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

