import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../src/lib/firebase';
import { signupSchema, calcAge, SignupFormData } from '../../src/utils/validation';
import { fullPlanFromProfile } from '../../src/logic/nutrition';
import { colors } from '../../src/theme';

type SelectOption = {
  label: string;
  value: string;
};

export default function SignupScreen() {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  const commonInputProps: TextInputProps = {
    returnKeyType: 'done',
    blurOnSubmit: true,
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      title: undefined,
      firstName: '',
      lastName: '',
      sex: 'Male',
      email: '',
      password: '',
      confirm: '',
      dob: '',
      heightCm: undefined as any,
      weightKg: undefined as any,
      goal: 'Fat Loss',
      goalWeightKg: undefined,
      activity: 'None',
    },
  });

  const dob = watch('dob');
  const age = dob ? calcAge(dob) : 0;
  const ageError = age > 0 && age < 15 ? 'You must be at least 15 years old' : '';
  const isAgeValid = !dob || age >= 15;

  const titleOptions: SelectOption[] = [
    { label: 'Mr', value: 'Mr' },
    { label: 'Mrs', value: 'Mrs' },
    { label: 'Miss', value: 'Miss' },
    { label: 'Ms', value: 'Ms' },
    { label: 'Mx', value: 'Mx' },
  ];

  const sexOptions: SelectOption[] = [
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
  ];

  const goalOptions: SelectOption[] = [
    { label: 'Fat Loss', value: 'Fat Loss' },
    { label: 'Strength & Conditioning', value: 'Strength & Conditioning' },
    { label: 'Muscle Gain', value: 'Muscle Gain' },
    { label: 'Maintenance', value: 'Maintenance' },
  ];

  const activityOptions: SelectOption[] = [
    { label: 'None', value: 'None' },
    { label: '1-3/wk', value: '1-3/wk' },
    { label: '4-5/wk', value: '4-5/wk' },
    { label: '6-7/wk or manual', value: '6-7/wk or manual' },
  ];

  const dayOptions: SelectOption[] = Array.from({ length: 31 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    return { label: value, value };
  });

  const monthOptionsDob: SelectOption[] = [
    { label: 'January', value: '01' },
    { label: 'February', value: '02' },
    { label: 'March', value: '03' },
    { label: 'April', value: '04' },
    { label: 'May', value: '05' },
    { label: 'June', value: '06' },
    { label: 'July', value: '07' },
    { label: 'August', value: '08' },
    { label: 'September', value: '09' },
    { label: 'October', value: '10' },
    { label: 'November', value: '11' },
    { label: 'December', value: '12' },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions: SelectOption[] = Array.from({ length: 100 }, (_, index) => {
    const value = String(currentYear - index);
    return { label: value, value };
  });

  const setDobFromParts = (day: string, month: string, year: string) => {
    setDobDay(day);
    setDobMonth(month);
    setDobYear(year);
    if (day && month && year) {
      const formatted = `${day}-${month}-${year}`;
      if (formatted !== dob) {
        setValue('dob', formatted, { shouldDirty: true });
      }
    } else {
      if (dob) setValue('dob', '', { shouldDirty: true });
    }
  };

  useEffect(() => {
    if (!dob) return;
    const [day, month, year] = dob.split('-');
    if (day && day !== dobDay) setDobDay(day);
    if (month && month !== dobMonth) setDobMonth(month);
    if (year && year !== dobYear) setDobYear(year);
  }, [dob]);

  const renderSelectField = (
    name: keyof SignupFormData,
    label: string,
    options: SelectOption[],
    value: any
  ) => {
    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={[styles.selectButton, errors[name] && styles.inputError]}
          onPress={() => setShowPicker(name)}
        >
          <Text style={[styles.selectButtonText, !value && styles.placeholder]}>
            {value || 'Select...'}
          </Text>
        </TouchableOpacity>
        {errors[name] && (
          <Text style={styles.errorText}>{errors[name]?.message as string}</Text>
        )}
        <Modal
          visible={showPicker === name}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select {label}</Text>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.modalOption}
                  onPress={() => {
                    setValue(name, option.value as any);
                    setShowPicker(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalOption, styles.modalCancel]}
                onPress={() => setShowPicker(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderDobSelect = (
    id: 'dobDay' | 'dobMonth' | 'dobYear',
    label: string,
    options: SelectOption[],
    value: string,
    onSelect: (val: string) => void
  ) => (
    <View style={styles.dobColumn}>
      <Text style={styles.dobLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectButton, !value && styles.selectPlaceholder]}
        onPress={() => setShowPicker(id)}
      >
        <Text style={[styles.selectButtonText, !value && styles.placeholder]}>{value || 'Select'}</Text>
      </TouchableOpacity>
      <Modal
        visible={showPicker === id}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select {label}</Text>
            <ScrollView>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.modalOption}
                  onPress={() => {
                    onSelect(option.value);
                    setShowPicker(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalOption, styles.modalCancel]} onPress={() => setShowPicker(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  const onSubmit = async (data: SignupFormData) => {
    if (!isAgeValid) {
      Alert.alert('Error', 'You must be at least 15 years old to sign up');
      return;
    }

    setLoading(true);
    try {
      // 1) Create user account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      const uid = userCredential.user.uid;

      // 2) Compute age
      const computedAge = calcAge(data.dob);

      // 3) Build profile object
      const profile = {
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        sex: data.sex,
        email: data.email,
        dob: data.dob,
        age: computedAge,
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        goal: data.goal,
        goalWeightKg: data.goalWeightKg,
        activity: data.activity,
        tier: 'free' as const,
      };

      // 4) Compute targets using fullPlanFromProfile
      const computedPlan = fullPlanFromProfile(profile);
      if (!computedPlan) {
        throw new Error('Failed to calculate targets. Please check your profile information.');
      }

      // 5) Write to Firestore
      await setDoc(doc(db, 'users', uid), {
        profile,
        targets: {
          calories: computedPlan.target,
          proteinG: computedPlan.proteinG,
          carbsG: computedPlan.carbsG,
          fatsG: computedPlan.fatG,
        },
        checkin: {
          dayOfWeek: 'Monday',
          stepTarget: 10000,
          lissMinPerSession: 20,
          lissSessionsPerWeek: 4,
        },
      });

      // Route to tabs
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Sign up to get started</Text>

      <View style={styles.form}>
        {/* Title */}
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) =>
            renderSelectField('title', 'Title (Optional)', titleOptions, value)
          }
        />

        {/* First Name */}
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                placeholder="First Name"
                placeholderTextColor={colors.textDim}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!loading}
                {...commonInputProps}
              />
              {errors.firstName && (
                <Text style={styles.errorText}>{errors.firstName.message}</Text>
              )}
            </View>
          )}
        />

        {/* Last Name */}
        <Controller
          control={control}
          name="lastName"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                placeholder="Last Name"
                placeholderTextColor={colors.textDim}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={!loading}
                {...commonInputProps}
              />
              {errors.lastName && (
                <Text style={styles.errorText}>{errors.lastName.message}</Text>
              )}
            </View>
          )}
        />

        {/* Sex */}
        <Controller
          control={control}
          name="sex"
          render={({ field: { onChange, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Sex</Text>
              <View style={styles.radioGroup}>
                {sexOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.radioButton,
                      value === option.value && styles.radioButtonActive,
                    ]}
                    onPress={() => onChange(option.value)}
                  >
                    <Text
                      style={[
                        styles.radioButtonText,
                        value === option.value && styles.radioButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.sex && (
                <Text style={styles.errorText}>{errors.sex.message}</Text>
              )}
            </View>
          )}
        />

        {/* Email */}
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="Email"
                placeholderTextColor={colors.textDim}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                {...commonInputProps}
              />
              {errors.email && (
                <Text style={styles.errorText}>{errors.email.message}</Text>
              )}
            </View>
          )}
        />

        {/* Password */}
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="Password"
                placeholderTextColor={colors.textDim}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                editable={!loading}
                {...commonInputProps}
              />
              {errors.password && (
                <Text style={styles.errorText}>{errors.password.message}</Text>
              )}
              <Text style={styles.helperText}>
                Password must be at least 8 characters, include 1 capital letter, 1 number, and 1 special character
              </Text>
            </View>
          )}
        />

        {/* Confirm Password */}
        <Controller
          control={control}
          name="confirm"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={[styles.input, errors.confirm && styles.inputError]}
                placeholder="Confirm Password"
                placeholderTextColor={colors.textDim}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                editable={!loading}
                {...commonInputProps}
              />
              {errors.confirm && (
                <Text style={styles.errorText}>{errors.confirm.message}</Text>
              )}
            </View>
          )}
        />

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <View style={styles.dobRow}>
            {renderDobSelect('dobDay', 'Day', dayOptions, dobDay, (val) => setDobFromParts(val, dobMonth, dobYear))}
            {renderDobSelect('dobMonth', 'Month', monthOptionsDob, dobMonth, (val) => setDobFromParts(dobDay, val, dobYear))}
            {renderDobSelect('dobYear', 'Year', yearOptions, dobYear, (val) => setDobFromParts(dobDay, dobMonth, val))}
          </View>
          {errors.dob && <Text style={styles.errorText}>{errors.dob.message}</Text>}
          {ageError && <Text style={styles.errorText}>{ageError}</Text>}
          {dob && isAgeValid && <Text style={styles.helperText}>Age: {age} years</Text>}
        </View>

        {/* Height */}
        <Controller
          control={control}
          name="heightCm"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput
                style={[styles.input, errors.heightCm && styles.inputError]}
                placeholder="Height in centimeters"
                placeholderTextColor={colors.textDim}
                value={value?.toString() || ''}
                onChangeText={(text) => onChange(text ? parseFloat(text) : undefined)}
                onBlur={onBlur}
                keyboardType="numeric"
                editable={!loading}
                {...commonInputProps}
              />
              {errors.heightCm && (
                <Text style={styles.errorText}>{errors.heightCm.message}</Text>
              )}
            </View>
          )}
        />

        {/* Weight */}
        <Controller
          control={control}
          name="weightKg"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput
                style={[styles.input, errors.weightKg && styles.inputError]}
                placeholder="Weight in kilograms"
                placeholderTextColor={colors.textDim}
                value={value?.toString() || ''}
                onChangeText={(text) => onChange(text ? parseFloat(text) : undefined)}
                onBlur={onBlur}
                keyboardType="numeric"
                editable={!loading}
                {...commonInputProps}
              />
              {errors.weightKg && (
                <Text style={styles.errorText}>{errors.weightKg.message}</Text>
              )}
            </View>
          )}
        />

        {/* Goal */}
        <Controller
          control={control}
          name="goal"
          render={({ field: { onChange, value } }) =>
            renderSelectField('goal', 'Goal', goalOptions, value)
          }
        />

        {/* Goal Weight (Optional) */}
        <Controller
          control={control}
          name="goalWeightKg"
          render={({ field: { onChange, onBlur, value } }) => (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Goal Weight (kg) - Optional</Text>
              <TextInput
                style={[styles.input, errors.goalWeightKg && styles.inputError]}
                placeholder="Goal weight in kilograms"
                placeholderTextColor={colors.textDim}
                value={value?.toString() || ''}
                onChangeText={(text) => onChange(text ? parseFloat(text) : undefined)}
                onBlur={onBlur}
                keyboardType="numeric"
                editable={!loading}
                {...commonInputProps}
              />
              {errors.goalWeightKg && (
                <Text style={styles.errorText}>{errors.goalWeightKg.message}</Text>
              )}
            </View>
          )}
        />

        {/* Activity */}
        <Controller
          control={control}
          name="activity"
          render={({ field: { onChange, value } }) =>
            renderSelectField('activity', 'Activity Level', activityOptions, value)
          }
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, (!isAgeValid || loading) && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={!isAgeValid || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>
      </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textDim,
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  selectButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    justifyContent: 'center',
  },
  selectButtonText: {
    color: colors.text,
    fontSize: 16,
  },
  selectPlaceholder: {
    borderStyle: 'dashed',
  },
  placeholder: {
    color: colors.textDim,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  radioButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  radioButtonText: {
    color: colors.text,
    fontSize: 16,
  },
  radioButtonTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  modalOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalOptionText: {
    color: colors.text,
    fontSize: 16,
  },
  modalCancel: {
    marginTop: 8,
    borderBottomWidth: 0,
  },
  modalCancelText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  dobRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dobColumn: {
    flex: 1,
  },
  dobLabel: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 6,
  },
});
