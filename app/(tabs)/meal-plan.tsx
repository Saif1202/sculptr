import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, collection, onSnapshot, addDoc, deleteDoc, serverTimestamp, query, orderBy, getDoc } from 'firebase/firestore';
import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { todayISO } from '../../src/utils/date';
import { FoodSearchModal } from '../(modals)/food-search';
import FoodScannerModal from '../(modals)/food-scanner';
import FoodConfirmModal from '../(modals)/food-confirm';
import PresetMealPlansModal from '../(modals)/preset-meal-plans';
import type { FoodItem } from '../../src/lib/food';
import { generateMealPlan, GenerateMealPlanPayload } from '../../src/lib/functions';

interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

interface MealEntry {
  id: string;
  label: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  createdAt: any;
}

export default function MealPlanScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [profileGoal, setProfileGoal] = useState<string | null>(null);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [confirmFood, setConfirmFood] = useState<(FoodItem & { id?: string }) | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [presetPlansVisible, setPresetPlansVisible] = useState(false);
  
  // Modal form state
  const [label, setLabel] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatsG, setFatsG] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const today = todayISO();
    
    // Load targets
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeTargets = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setTargets(data.targets ?? null);
          setProfileGoal(data.profile?.goal ?? null);
        } else {
          // User doc doesn't exist yet - treat as empty
          setTargets(null);
          setProfileGoal(null);
        }
        setLoading(false);
      },
      (err) => {
        // Handle permission errors gracefully - treat as empty
        console.warn('Error loading targets:', err);
        setTargets(null);
        setProfileGoal(null);
        setLoading(false);
      }
    );

    // Load today's entries
    const entriesRef = collection(db, 'users', user.uid, 'meals', today, 'entries');
    const entriesQuery = query(entriesRef, orderBy('createdAt', 'desc'));
    const unsubscribeEntries = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const mealEntries: MealEntry[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          mealEntries.push({
            id: doc.id,
            label: data.label || '',
            calories: data.calories || 0,
            proteinG: data.proteinG || 0,
            carbsG: data.carbsG || 0,
            fatsG: data.fatsG || 0,
            createdAt: data.createdAt,
          });
        });
        setEntries(mealEntries);
      },
      (err) => {
        // Handle permission errors or missing collection gracefully - treat as empty
        console.warn('Error loading entries:', err);
        setEntries([]);
      }
    );

    return () => {
      unsubscribeTargets();
      unsubscribeEntries();
    };
  }, [user]);

  // Calculate totals
  const used = {
    calories: entries.reduce((sum, e) => sum + (e.calories || 0), 0),
    proteinG: entries.reduce((sum, e) => sum + (e.proteinG || 0), 0),
    carbsG: entries.reduce((sum, e) => sum + (e.carbsG || 0), 0),
    fatsG: entries.reduce((sum, e) => sum + (e.fatsG || 0), 0),
  };

  const remaining = targets ? {
    calories: Math.max(0, targets.calories - used.calories),
    proteinG: Math.max(0, targets.proteinG - used.proteinG),
    carbsG: Math.max(0, targets.carbsG - used.carbsG),
    fatsG: Math.max(0, targets.fatsG - used.fatsG),
  } : { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 };

  // Guardrail logic
  const isOutsideTarget = targets ? (
    used.calories > targets.calories + 50 ||
    used.calories < targets.calories - 75
  ) : false;

  const handleGenerateAIMealPlan = async () => {
    if (!user || !targets || !profileGoal) {
      Alert.alert('Requirements', 'Please complete your profile and ensure targets are set to generate an AI meal plan.');
      return;
    }

    setAiGenerating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const profile = userDoc.exists() ? (userDoc.data() as any)?.profile : null;

      if (!profile) {
        Alert.alert('Profile Required', 'Please complete your profile first.');
        setAiGenerating(false);
        return;
      }

      const payload: GenerateMealPlanPayload = {
        profile: {
          goal: profile.goal,
          sex: profile.sex,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          activity: profile.activity,
        },
        targets: {
          calories: targets.calories,
          proteinG: targets.proteinG,
          carbsG: targets.carbsG,
          fatsG: targets.fatsG,
        },
      };

      const result = await generateMealPlan(payload);
      
      // Show success message with option to view plan
      Alert.alert(
        'Meal Plan Generated!',
        `A 7-day meal plan has been generated matching your targets. You can now add meals manually or ask Jim in chat for meal suggestions.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('AI meal plan generation error:', error);
      Alert.alert('Error', error.message || 'Failed to generate meal plan. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!user) return;
    
    const today = todayISO();
    const entryRef = doc(db, 'users', user.uid, 'meals', today, 'entries', entryId);
    
    try {
      await deleteDoc(entryRef);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to delete entry: ' + error.message);
    }
  };

  const handleSave = async () => {
    if (!user || !label.trim()) {
      Alert.alert('Error', 'Please enter a food label');
      return;
    }

    setSaving(true);
    const today = todayISO();
    
    const entryData = {
      label: label.trim(),
      calories: Math.round(parseFloat(calories) || 0),
      proteinG: Math.round(parseFloat(proteinG) || 0),
      carbsG: Math.round(parseFloat(carbsG) || 0),
      fatsG: Math.round(parseFloat(fatsG) || 0),
      source: 'user',
      createdAt: serverTimestamp(),
    };

    try {
      const entriesRef = collection(db, 'users', user.uid, 'meals', today, 'entries');
      await addDoc(entriesRef, entryData);
      
      // Reset form and close modal
      setLabel('');
      setCalories('');
      setProteinG('');
      setCarbsG('');
      setFatsG('');
      setShowModal(false);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save entry: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFoodSelected = (food: FoodItem & { id?: string }) => {
    setConfirmFood(food);
    setConfirmVisible(true);
  };

  const handleFoodAdded = () => {
    setConfirmVisible(false);
    setConfirmFood(null);
    setShowFoodSearch(false);
    setShowScanner(false);
  };

  const handleScannerResult = (food: FoodItem & { id?: string }) => {
    setShowScanner(false);
    handleFoodSelected(food);
  };

  const handleNext = () => {
    if (isOutsideTarget) {
      Alert.alert('Cannot Proceed', 'You are outside your daily target. Adjust your meals before proceeding.');
      return;
    }
    router.push('/(tabs)/training-plan');
  };

  const parseNumber = (value: string): number => {
    const num = parseFloat(value);
    return isNaN(num) || num < 0 ? 0 : num;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading meal plan...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Meal Plan</Text>
          <TouchableOpacity
            style={[styles.aiButton, aiGenerating && styles.aiButtonDisabled]}
            onPress={handleGenerateAIMealPlan}
            disabled={aiGenerating || !targets || !profileGoal}
          >
            {aiGenerating ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <>
                <Text style={styles.aiButtonText}>🤖 AI Plan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Strength Banner */}
        {profileGoal === 'Strength & Conditioning' && (
          <View style={styles.trainingBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.trainingBannerTitle}>Dial in your training</Text>
              <Text style={styles.trainingBannerText}>
                Build structured workouts to complement your strength plan.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.trainingBannerButton}
              onPress={() => router.push('/(tabs)/training?tab=workouts')}
            >
              <Ionicons name="barbell" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.trainingBannerButtonText}>Open Training</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Guardrail Banner */}
        {isOutsideTarget && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              You are outside your daily target. Adjust your meals before proceeding.
            </Text>
          </View>
        )}

        {/* Header Card - Targets, Used, Remaining */}
        {targets && (
          <View style={styles.headerCard}>
            <View style={styles.macroRow}>
              <View style={styles.macroColumn}>
                <Text style={styles.macroLabel}>Targets</Text>
                <Text style={styles.macroValue}>{Math.round(targets.calories)}</Text>
                <Text style={styles.macroValue}>{Math.round(targets.proteinG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(targets.carbsG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(targets.fatsG)}g</Text>
              </View>
              <View style={styles.macroColumn}>
                <Text style={styles.macroLabel}>Used</Text>
                <Text style={styles.macroValue}>{Math.round(used.calories)}</Text>
                <Text style={styles.macroValue}>{Math.round(used.proteinG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(used.carbsG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(used.fatsG)}g</Text>
              </View>
              <View style={styles.macroColumn}>
                <Text style={styles.macroLabel}>Remaining</Text>
                <Text style={[styles.macroValue, remaining.calories < 0 && styles.macroValueNegative]}>
                  {Math.round(remaining.calories)}
                </Text>
                <Text style={styles.macroValue}>{Math.round(remaining.proteinG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(remaining.carbsG)}g</Text>
                <Text style={styles.macroValue}>{Math.round(remaining.fatsG)}g</Text>
              </View>
            </View>
            <View style={styles.macroLabels}>
              <Text style={styles.macroLabelSmall}>Cal</Text>
              <Text style={styles.macroLabelSmall}>P</Text>
              <Text style={styles.macroLabelSmall}>C</Text>
              <Text style={styles.macroLabelSmall}>F</Text>
            </View>
          </View>
        )}

        {/* Entries List */}
        <View style={styles.entriesSection}>
          <Text style={styles.sectionTitle}>Today's Foods</Text>
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No foods added yet</Text>
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                <View style={styles.entryInfo}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={styles.entryMacros}>
                    {Math.round(entry.calories)} cal • {Math.round(entry.proteinG)}g P • {Math.round(entry.carbsG)}g C • {Math.round(entry.fatsG)}g F
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(entry.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Library Buttons */}
        <View style={styles.libraryButtons}>
          <TouchableOpacity style={styles.libraryButton} onPress={() => setShowFoodSearch(true)}>
            <Text style={styles.libraryButtonText}>Food Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.libraryButton} onPress={() => setShowScanner(true)}>
            <Text style={styles.libraryButtonText}>Scan Barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.libraryButton} onPress={() => setPresetPlansVisible(true)}>
            <Text style={styles.libraryButtonText}>Preset Plans</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Add Button */}
        <TouchableOpacity
          style={[styles.addButton, { flexDirection: 'row', justifyContent: 'center' }]}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="add-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>Quick Add</Text>
        </TouchableOpacity>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, isOutsideTarget && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={isOutsideTarget}
        >
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Food Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Food</Text>

            <Text style={styles.inputLabel}>Label</Text>
            <TextInput
              style={styles.input}
              placeholder="Food name"
              placeholderTextColor={colors.textDim}
              value={label}
              onChangeText={setLabel}
              returnKeyType="done"
            />

            <Text style={styles.inputLabel}>Calories</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              value={calories}
              onChangeText={(text) => setCalories(text)}
              keyboardType="numeric"
              returnKeyType="done"
            />

            <Text style={styles.inputLabel}>Protein (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              value={proteinG}
              onChangeText={(text) => setProteinG(text)}
              keyboardType="numeric"
              returnKeyType="done"
            />

            <Text style={styles.inputLabel}>Carbs (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              value={carbsG}
              onChangeText={(text) => setCarbsG(text)}
              keyboardType="numeric"
              returnKeyType="done"
            />

            <Text style={styles.inputLabel}>Fats (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              value={fatsG}
              onChangeText={(text) => setFatsG(text)}
              keyboardType="numeric"
              returnKeyType="done"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowModal(false);
                  setLabel('');
                  setCalories('');
                  setProteinG('');
                  setCarbsG('');
                  setFatsG('');
                }}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.modalButtonSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Food Library Modal */}
      {user && (
        <FoodSearchModal
          visible={showFoodSearch}
          onClose={() => setShowFoodSearch(false)}
          uid={user.uid}
          onSelectFood={(food) => {
            setShowFoodSearch(false);
            handleFoodSelected(food);
          }}
        />
      )}

      {/* Scanner Modal */}
      <FoodScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={handleScannerResult}
      />

      {/* Confirm Modal */}
      {user && confirmFood && (
        <FoodConfirmModal
          visible={confirmVisible}
          onClose={() => {
            setConfirmVisible(false);
            setConfirmFood(null);
          }}
          userId={user.uid}
          initial={confirmFood}
          onAdded={handleFoodAdded}
        />
      )}

      {/* Preset Meal Plans Modal */}
      {user && (
        <PresetMealPlansModal
          visible={presetPlansVisible}
          onClose={() => setPresetPlansVisible(false)}
          userId={user.uid}
          userGoal={profileGoal || undefined}
          userTargets={targets}
          onPlanApplied={() => {
            // Refresh entries will happen automatically via Firestore listener
            setPresetPlansVisible(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  aiButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiButtonDisabled: {
    opacity: 0.5,
  },
  aiButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textDim,
    marginTop: 12,
    fontSize: 14,
  },
  banner: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  trainingBanner: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trainingBannerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  trainingBannerText: {
    color: colors.textDim,
    fontSize: 13,
  },
  trainingBannerButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trainingBannerButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  bannerText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  macroColumn: {
    flex: 1,
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  macroValue: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  macroValueNegative: {
    color: colors.danger,
  },
  macroLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  macroLabelSmall: {
    fontSize: 12,
    color: colors.textDim,
    flex: 1,
    textAlign: 'center',
  },
  entriesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyStateText: {
    color: colors.textDim,
    fontSize: 16,
  },
  entryRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  entryInfo: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  entryMacros: {
    fontSize: 14,
    color: colors.textDim,
  },
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  libraryButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  libraryButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  libraryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  addButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
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
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    color: colors.text,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonSave: {
    backgroundColor: colors.accent,
  },
  modalButtonCancelText: {
    color: colors.textDim,
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonSaveText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
