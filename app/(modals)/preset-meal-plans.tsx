import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { PRESET_MEAL_PLANS, PresetMealPlan, getPresetMealPlansByGoal } from '../../src/lib/presetMealPlans';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { todayISO, addDaysISO } from '../../src/utils/date';
import { Alert } from 'react-native';

interface PresetMealPlansModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userGoal?: string;
  onPlanApplied?: () => void;
}

export default function PresetMealPlansModal({
  visible,
  onClose,
  userId,
  userGoal,
  onPlanApplied,
}: PresetMealPlansModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PresetMealPlan | null>(null);
  const [applying, setApplying] = useState(false);

  const availablePlans = getPresetMealPlansByGoal(userGoal);

  const handleApplyPlan = async (plan: PresetMealPlan) => {
    setApplying(true);
    try {
      // Apply meals for the next 7 days
      const today = todayISO();
      for (let i = 0; i < 7; i++) {
        const dateISO = addDaysISO(today, i);
        const dayKey = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] as keyof typeof plan.plan;
        const dayMeals = plan.plan[dayKey];

        for (const meal of dayMeals.meals) {
          await addDoc(collection(db, 'users', userId, 'meals', dateISO, 'entries'), {
            label: meal.name,
            calories: meal.calories,
            proteinG: meal.proteinG,
            carbsG: meal.carbsG,
            fatsG: meal.fatsG,
            ingredients: meal.ingredients || null,
            instructions: meal.instructions || null,
            createdAt: serverTimestamp(),
          });
        }
      }

      if (onPlanApplied) {
        onPlanApplied();
      }
      onClose();
    } catch (error: any) {
      console.error('Error applying meal plan:', error);
      Alert.alert('Error', 'Failed to apply meal plan. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Preset Meal Plans</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.description}>
              Choose a preset meal plan to automatically add meals for the next 7 days.
            </Text>

            {availablePlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, selectedPlan?.id === plan.id && styles.planCardSelected]}
                onPress={() => setSelectedPlan(plan)}
              >
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.goalBadge}>
                    <Text style={styles.goalBadgeText}>{plan.goal}</Text>
                  </View>
                </View>
                <Text style={styles.planDescription}>{plan.description}</Text>
                <View style={styles.macroRow}>
                  <Text style={styles.macroText}>{plan.totalCalories} cal</Text>
                  <Text style={styles.macroText}>{plan.totalProtein}g P</Text>
                  <Text style={styles.macroText}>{plan.totalCarbs}g C</Text>
                  <Text style={styles.macroText}>{plan.totalFats}g F</Text>
                </View>
                {selectedPlan?.id === plan.id && (
                  <View style={styles.mealDetails}>
                    <Text style={styles.mealDetailsTitle}>Meal Details:</Text>
                    {Object.entries(plan.plan).map(([day, dayMeals]) => (
                      <View key={day} style={styles.daySection}>
                        <Text style={styles.dayTitle}>{day}</Text>
                        {dayMeals.meals.map((meal, idx) => (
                          <View key={idx} style={styles.mealItem}>
                            <Text style={styles.mealName}>{meal.name} ({meal.time})</Text>
                            {meal.ingredients && meal.ingredients.length > 0 && (
                              <View style={styles.ingredientsList}>
                                <Text style={styles.ingredientsTitle}>Ingredients:</Text>
                                {meal.ingredients.map((ing, i) => (
                                  <Text key={i} style={styles.ingredientItem}>
                                    • {ing.name}: {ing.amount} {ing.unit || ''}
                                  </Text>
                                ))}
                              </View>
                            )}
                            {meal.instructions && (
                              <Text style={styles.instructionsText}>
                                <Text style={styles.instructionsLabel}>Instructions: </Text>
                                {meal.instructions}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {availablePlans.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No preset plans available for your goal.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, (!selectedPlan || applying) && styles.applyButtonDisabled]}
              onPress={() => selectedPlan && handleApplyPlan(selectedPlan)}
              disabled={!selectedPlan || applying}
            >
              {applying ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.applyButtonText}>Apply Plan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  description: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardSelected: {
    borderColor: colors.accent,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  goalBadge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  goalBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  planDescription: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 12,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  mealDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mealDetailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  daySection: {
    marginBottom: 16,
  },
  dayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  mealItem: {
    marginBottom: 12,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingBottom: 8,
  },
  mealName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  ingredientsList: {
    marginBottom: 6,
  },
  ingredientsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDim,
    marginBottom: 4,
  },
  ingredientItem: {
    fontSize: 12,
    color: colors.textDim,
    marginLeft: 8,
    marginBottom: 2,
  },
  instructionsText: {
    fontSize: 12,
    color: colors.textDim,
    fontStyle: 'italic',
    marginTop: 4,
  },
  instructionsLabel: {
    fontWeight: '600',
    color: colors.text,
  },
});
