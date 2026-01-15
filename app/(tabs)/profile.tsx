import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { calcAge, fullPlanFromProfile } from '../../src/logic/nutrition';

type ActivityLevel = 'None' | '1-3/wk' | '4-5/wk' | '6-7/wk or manual';
type Goal = 'Fat Loss' | 'Strength & Conditioning' | 'Muscle Gain' | 'Maintenance';
type Sex = 'Male' | 'Female';

interface UserProfile {
  title?: string;
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  email?: string;
  dob?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  goal?: Goal;
  goalWeightKg?: number | null;
  activity?: ActivityLevel;
  tier?: 'free' | 'premium';
}

interface UserCheckin {
  dayOfWeek?: string;
  stepTarget?: number;
  lissMinPerSession?: number;
  lissSessionsPerWeek?: number;
}

interface UserData {
  profile?: UserProfile;
  checkin?: UserCheckin;
}

type SelectOption = {
  label: string;
  value: string;
};

const goalOptions: SelectOption[] = [
  { label: 'Fat Loss', value: 'Fat Loss' },
  { label: 'Strength & Conditioning', value: 'Strength & Conditioning' },
  { label: 'Muscle Gain', value: 'Muscle Gain' },
  { label: 'Maintenance', value: 'Maintenance' },
];

const sexOptions: SelectOption[] = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
];

const activityOptions: SelectOption[] = [
  { label: 'None', value: 'None' },
  { label: '1-3 sessions per week', value: '1-3/wk' },
  { label: '4-5 sessions per week', value: '4-5/wk' },
  { label: '6-7 sessions per week or manual', value: '6-7/wk or manual' },
];

const checkinDayOptions: SelectOption[] = [
  { label: 'Monday', value: 'Monday' },
  { label: 'Tuesday', value: 'Tuesday' },
  { label: 'Wednesday', value: 'Wednesday' },
  { label: 'Thursday', value: 'Thursday' },
  { label: 'Friday', value: 'Friday' },
  { label: 'Saturday', value: 'Saturday' },
  { label: 'Sunday', value: 'Sunday' },
];

type FormValues = {
  title: string;
  firstName: string;
  lastName: string;
  sex: Sex | '';
  email: string;
  dob: string;
  heightCm: string;
  weightKg: string;
  goal: Goal | '';
  goalWeightKg: string;
  activity: ActivityLevel | '';
  checkinDay: string;
};

const formSchemaBase = z.object({
  title: z.string().optional(),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  sex: z
    .union([z.enum(['Male', 'Female']), z.literal('')])
    .refine((val) => val !== '', 'Select sex'),
  email: z.string().email('Invalid email'),
  dob: z
    .string()
    .trim()
    .min(1, 'Date of birth is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .superRefine((val, ctx) => {
      const age = calcAge(val);
      if (Number.isNaN(age)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date of birth' });
      } else if (age < 15) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'You must be at least 15 years old' });
      }
    }),
  heightCm: z
    .string()
    .trim()
    .min(1, 'Height is required')
    .refine((val) => parseFloat(val) > 0, 'Height must be greater than 0'),
  weightKg: z
    .string()
    .trim()
    .min(1, 'Weight is required')
    .refine((val) => parseFloat(val) > 0, 'Weight must be greater than 0'),
  goal: z
    .union([z.enum(['Fat Loss', 'Strength & Conditioning', 'Muscle Gain', 'Maintenance']), z.literal('')])
    .refine((val) => val !== '', 'Select a goal'),
  goalWeightKg: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true;
      return !Number.isNaN(parseFloat(val));
    }, 'Enter a valid number'),
  activity: z
    .union([z.enum(['None', '1-3/wk', '4-5/wk', '6-7/wk or manual']), z.literal('')])
    .refine((val) => val !== '', 'Select an activity level'),
  checkinDay: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
});

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [checkinData, setCheckinData] = useState<UserCheckin | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    options: SelectOption[];
    onSelect: (value: string) => void;
  } | null>(null);
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver<FormValues, any, FormValues>(formSchemaBase as any),
    defaultValues: {
      title: '',
      firstName: '',
      lastName: '',
      sex: '',
      email: '',
      dob: '',
      heightCm: '',
      weightKg: '',
      goal: '',
      goalWeightKg: '',
      activity: '',
      checkinDay: 'Monday',
    } as FormValues,
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserData & { checkin?: UserCheckin };
          setUserData(data);
          setCheckinData(data.checkin ?? null);

          const profile = data.profile ?? {};
          const checkinDay = data.checkin?.dayOfWeek ?? 'Monday';

          reset({
            title: profile.title ?? '',
            firstName: profile.firstName ?? '',
            lastName: profile.lastName ?? '',
            sex: (profile.sex ?? '') as FormValues['sex'],
            email: profile.email ?? user.email ?? '',
            dob: profile.dob ?? '',
            heightCm: profile.heightCm != null ? String(profile.heightCm) : '',
            weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
            goal: (profile.goal ?? '') as FormValues['goal'],
            goalWeightKg: profile.goalWeightKg != null ? String(profile.goalWeightKg) : '',
            activity: (profile.activity ?? '') as FormValues['activity'],
            checkinDay,
          });

          if (profile.dob) {
            const [year, month, day] = profile.dob.split('-');
            setDobYear(year ?? '');
            setDobMonth(month ?? '');
            setDobDay(day ?? '');
          } else {
            setDobYear('');
            setDobMonth('');
            setDobDay('');
          }
        } else {
          // No profile yet - reset to defaults
          reset({
            title: '',
            firstName: '',
            lastName: '',
            sex: '',
            email: user.email ?? '',
            dob: '',
            heightCm: '',
            weightKg: '',
            goal: '',
            goalWeightKg: '',
            activity: '',
            checkinDay: 'Monday',
          });
          setUserData(null);
          setCheckinData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Error loading profile:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, reset]);

  const watchSex = watch('sex');
  const watchGoal = watch('goal');
  const watchActivity = watch('activity');
  const watchWeight = watch('weightKg');
  const watchHeight = watch('heightCm');
  const watchDob = watch('dob');

  const dobDayOptions: SelectOption[] = useMemo(
    () => Array.from({ length: 31 }, (_, index) => {
      const value = String(index + 1).padStart(2, '0');
      return { label: value, value };
    }),
    []
  );

  const dobMonthOptions: SelectOption[] = useMemo(
    () => [
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
    ],
    []
  );

  const currentYear = new Date().getFullYear();
  const dobYearOptions: SelectOption[] = useMemo(
    () => Array.from({ length: 100 }, (_, index) => {
      const value = String(currentYear - index);
      return { label: value, value };
    }),
    [currentYear]
  );

  const previewPlan = useMemo(() => {
    const sex = watchSex as Sex;
    const goal = watchGoal as Goal;
    const activity = watchActivity as ActivityLevel;
    const weight = parseFloat(watchWeight);
    const height = parseFloat(watchHeight);
    const dob = watchDob;

    if (!sex || !goal || !activity || Number.isNaN(weight) || Number.isNaN(height) || weight <= 0 || height <= 0 || !dob) {
      return null;
    }

    return fullPlanFromProfile({
      sex,
      goal,
      activity,
      weightKg: weight,
      heightCm: height,
      dob,
    });
  }, [watchSex, watchGoal, watchActivity, watchWeight, watchHeight, watchDob]);

  const restDayCalories = useMemo(() => {
    if (!previewPlan) return null;
    if (watchGoal !== 'Fat Loss') return null;
    return previewPlan.target - 200;
  }, [previewPlan, watchGoal]);

  const openSelect = (title: string, options: SelectOption[], onSelect: (value: string) => void) => {
    setModalConfig({ title, options, onSelect });
    setModalVisible(true);
  };

  const handleSave = async (values: FormValues) => {
    if (!user) return;

    setSaving(true);
    try {
      const parsed = formSchemaBase.parse(values);
      const age = calcAge(parsed.dob);
      if (Number.isNaN(age) || age < 15) {
        Alert.alert('Error', 'You must be at least 15 years old');
        setSaving(false);
        return;
      }

      const heightCm = parseFloat(parsed.heightCm);
      const weightKg = parseFloat(parsed.weightKg);
      const goalWeight = parsed.goalWeightKg && parsed.goalWeightKg.trim() !== '' ? parseFloat(parsed.goalWeightKg) : null;

      const profilePayload: UserProfile = {
        title: parsed.title?.trim() ?? '',
        firstName: parsed.firstName.trim(),
        lastName: parsed.lastName.trim(),
        sex: parsed.sex as Sex,
        email: parsed.email,
        dob: parsed.dob,
        age,
        heightCm,
        weightKg,
        goal: parsed.goal as Goal,
        goalWeightKg: goalWeight,
        activity: parsed.activity as ActivityLevel,
        tier: userData?.profile?.tier ?? 'free',
      };

      const plan = fullPlanFromProfile({
        sex: profilePayload.sex,
        weightKg: profilePayload.weightKg,
        heightCm: profilePayload.heightCm,
        goal: profilePayload.goal,
        activity: profilePayload.activity,
        dob: profilePayload.dob,
        age,
      });

      if (!plan) {
        Alert.alert('Error', 'Unable to calculate nutrition targets. Please check your profile details.');
        setSaving(false);
        return;
      }

      const targetsPayload = {
        calories: plan.target,
        proteinG: plan.proteinG,
        carbsG: plan.carbsG,
        fatsG: plan.fatG,
      };

      const updatedCheckin: UserCheckin = {
        ...(checkinData ?? {}),
        dayOfWeek: parsed.checkinDay,
      };

      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(
        userDocRef,
        {
          profile: profilePayload,
          targets: targetsPayload,
          checkin: updatedCheckin,
        },
        { merge: true }
      );

      Alert.alert('Success', 'Profile saved');
      reset({ ...parsed });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const renderTextField = (name: keyof FormValues, label: string, props?: Partial<React.ComponentProps<typeof TextInput>>) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={[styles.input, props?.editable === false && styles.inputDisabled]}
            placeholderTextColor={colors.textDim}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            returnKeyType="done"
            blurOnSubmit
            {...props}
          />
          {errors[name] && (
            <Text style={styles.errorMessage}>{(errors as any)[name]?.message}</Text>
          )}
        </View>
      )}
    />
  );

  const renderSelectField = (name: keyof FormValues, label: string, options: SelectOption[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{label}</Text>
          <TouchableOpacity
            style={[styles.selectButton, !field.value && styles.selectButtonPlaceholder]}
            onPress={() => openSelect(label, options, (value) => {
              field.onChange(value);
              setModalVisible(false);
            })}
          >
            <Text style={styles.selectButtonText}>
              {field.value ? options.find((opt) => opt.value === field.value)?.label ?? field.value : `Select ${label}`}
            </Text>
          </TouchableOpacity>
          {errors[name] && (
            <Text style={styles.errorMessage}>{(errors as any)[name]?.message}</Text>
          )}
        </View>
      )}
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Profile</Text>

          {renderTextField('title', 'Title (optional)', { placeholder: 'Mr, Ms, Coach...' })}
          {renderTextField('firstName', 'First Name', { placeholder: 'First name' })}
          {renderTextField('lastName', 'Last Name', { placeholder: 'Last name' })}
          {renderSelectField('sex', 'Sex', sexOptions)}
          {renderTextField('email', 'Email', { editable: false })}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <View style={styles.dobRow}>
              <TouchableOpacity
                style={[styles.selectButton, !dobDay && styles.selectButtonPlaceholder]}
                onPress={() => openSelect('Day', dobDayOptions, (value) => {
                  setDobDay(value);
                  const day = value;
                  const month = dobMonth;
                  const year = dobYear;
                  if (day && month && year) {
                    setValue('dob', `${year}-${month}-${day}`, { shouldDirty: true });
                  } else {
                    setValue('dob', '', { shouldDirty: true });
                  }
                })}
              >
                <Text style={styles.selectButtonText}>{dobDay || 'Day'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectButton, !dobMonth && styles.selectButtonPlaceholder]}
                onPress={() => openSelect('Month', dobMonthOptions, (value) => {
                  setDobMonth(value);
                  const day = dobDay;
                  const month = value;
                  const year = dobYear;
                  if (day && month && year) {
                    setValue('dob', `${year}-${month}-${day}`, { shouldDirty: true });
                  } else {
                    setValue('dob', '', { shouldDirty: true });
                  }
                })}
              >
                <Text style={styles.selectButtonText}>
                  {dobMonth ? dobMonthOptions.find((opt) => opt.value === dobMonth)?.label ?? dobMonth : 'Month'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectButton, !dobYear && styles.selectButtonPlaceholder]}
                onPress={() => openSelect('Year', dobYearOptions, (value) => {
                  setDobYear(value);
                  const day = dobDay;
                  const month = dobMonth;
                  const year = value;
                  if (day && month && year) {
                    setValue('dob', `${year}-${month}-${day}`, { shouldDirty: true });
                  } else {
                    setValue('dob', '', { shouldDirty: true });
                  }
                })}
              >
                <Text style={styles.selectButtonText}>{dobYear || 'Year'}</Text>
              </TouchableOpacity>
            </View>
            {errors.dob && (
              <Text style={styles.errorMessage}>{errors.dob.message}</Text>
            )}
          </View>
          {renderTextField('heightCm', 'Height (cm)', {
            placeholder: 'e.g. 175',
            keyboardType: 'numeric',
          })}
          {renderTextField('weightKg', 'Weight (kg)', {
            placeholder: 'e.g. 70',
            keyboardType: 'numeric',
          })}
          {renderSelectField('goal', 'Goal', goalOptions)}
          {renderTextField('goalWeightKg', 'Goal Weight (kg)', {
            placeholder: 'Optional',
            keyboardType: 'numeric',
          })}
          {renderSelectField('activity', 'Activity Level', activityOptions)}
          {renderSelectField('checkinDay', 'Weekly Check-In Day', checkinDayOptions)}

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview Targets</Text>
            {previewPlan ? (
              <View>
                <View style={styles.previewRow}>
                  <PreviewItem label="Calories" value={previewPlan.target} />
                  <PreviewItem label="Protein" value={`${previewPlan.proteinG} g`} />
                </View>
                <View style={styles.previewRow}>
                  <PreviewItem label="Carbs" value={`${previewPlan.carbsG} g`} />
                  <PreviewItem label="Fats" value={`${previewPlan.fatG} g`} />
                </View>
                {restDayCalories !== null && (
                  <Text style={styles.restDayNote}>
                    Rest Day Calories (Fat Loss): {restDayCalories}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.previewPlaceholder}>
                Fill out the form to see your updated targets.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (!isDirty || saving) && styles.saveButtonDisabled]}
            onPress={handleSubmit(handleSave)}
            disabled={!isDirty || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{modalConfig?.title ?? ''}</Text>
              <ScrollView>
                {modalConfig?.options.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.modalOption}
                    onPress={() => {
                      modalConfig?.onSelect(option.value);
                      setModalVisible(false);
                      setModalConfig(null);
                    }}
                  >
                    <Text style={styles.modalOptionText}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => {
                  setModalVisible(false);
                  setModalConfig(null);
                }}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PreviewItem({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.previewItem}>
      <Text style={styles.previewItemLabel}>{label}</Text>
      <Text style={styles.previewItemValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  selectButton: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectButtonPlaceholder: {
    borderStyle: 'dashed',
  },
  selectButtonText: {
    color: colors.text,
    fontSize: 16,
  },
  errorMessage: {
    marginTop: 6,
    color: colors.danger,
    fontSize: 12,
  },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 16,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  previewItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  previewItemLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewItemValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  previewPlaceholder: {
    color: colors.textDim,
    fontSize: 14,
  },
  restDayNote: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.textDim,
    fontSize: 14,
  },
  dobRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalOptionText: {
    color: colors.text,
    fontSize: 16,
  },
  modalClose: {
    marginTop: 16,
    alignItems: 'center',
  },
  modalCloseText: {
    color: colors.textDim,
    fontSize: 14,
  },
});

