import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ActivityIndicator, Alert, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { todayISO } from '../../src/utils/date';
import { calcPortion } from '../../src/lib/food';
import { addRecentFood, upsertFoodToLibrary, type LibraryFood } from '../../src/lib/library';
import type { FoodItem } from '../../src/lib/food';

interface FoodConfirmProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  initial: FoodItem & {
    id?: string;
    defaultServingG?: number;
  };
  onAdded?: () => void;
}

export function FoodConfirmModal({ visible, onClose, initial, userId, onAdded }: FoodConfirmProps) {
  const [label, setLabel] = useState(initial.label);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [grams, setGrams] = useState(String(initial.defaultServingG ?? 100));
  const [kcal, setKcal] = useState('0');
  const [protein, setProtein] = useState('0');
  const [carbs, setCarbs] = useState('0');
  const [fats, setFats] = useState('0');
  const [saving, setSaving] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  const per100 = initial.per100;

  const portion = useMemo(() => {
    const gramsNumber = Number(grams);
    return calcPortion(per100, gramsNumber > 0 ? gramsNumber : 0);
  }, [per100, grams]);

  useEffect(() => {
    setLabel(initial.label);
    setBrand(initial.brand ?? '');
    setGrams(String(initial.defaultServingG ?? 100));
    setManualOverride(false);
  }, [initial]);

  useEffect(() => {
    if (!manualOverride) {
      setKcal(String(portion.kcal));
      setProtein(String(portion.proteinG));
      setCarbs(String(portion.carbsG));
      setFats(String(portion.fatsG));
    }
  }, [portion.kcal, portion.proteinG, portion.carbsG, portion.fatsG, manualOverride]);

  const handleAdd = async () => {
    if (!userId) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert('Error', 'Please provide a label for this food.');
      return;
    }

    const gramsNumber = Number(grams);
    const servings = gramsNumber > 0 ? gramsNumber : 100;
    const entryData = {
      label: trimmedLabel,
      brand: brand.trim() || null,
      calories: Math.max(0, Math.round(Number(kcal) || 0)),
      proteinG: Math.max(0, Math.round(Number(protein) || 0)),
      carbsG: Math.max(0, Math.round(Number(carbs) || 0)),
      fatsG: Math.max(0, Math.round(Number(fats) || 0)),
      portionG: Math.round(servings),
      per100,
      source: initial.source ?? 'library',
      barcode: initial.barcode ?? null,
      createdAt: serverTimestamp(),
    } as Record<string, any>;

    setSaving(true);
    try {
      let libraryFood: LibraryFood | null = null;
      try {
        if (initial.barcode) {
          libraryFood = await upsertFoodToLibrary(db, {
            label: trimmedLabel,
            brand: brand.trim() || undefined,
            barcode: initial.barcode,
            per100,
            defaultServingG: initial.defaultServingG,
            source: initial.source ?? 'off',
          });
        } else if (initial.source === 'off' && !initial.id) {
          libraryFood = await upsertFoodToLibrary(db, {
            label: trimmedLabel,
            brand: brand.trim() || undefined,
            per100,
            defaultServingG: initial.defaultServingG,
            source: 'off',
          });
        }
      } catch (error) {
        console.warn('Skipping library upsert:', error);
        libraryFood = null;
      }

      if (libraryFood) {
        entryData.foodId = libraryFood.id;
        if (!entryData.barcode && libraryFood.barcode) {
          entryData.barcode = libraryFood.barcode;
        }
      } else if (initial.id) {
        entryData.foodId = initial.id;
      }

      const today = todayISO();
      const entriesRef = collection(db, 'users', userId, 'meals', today, 'entries');
      await addDoc(entriesRef, entryData);

      if (entryData.foodId) {
        await addRecentFood(db, userId, entryData.foodId).catch(() => undefined);
      }

      onAdded?.();
      onClose();
    } catch (error: any) {
      console.warn('Failed to add food', error);
      Alert.alert('Error', error.message || 'Failed to add food');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <View style={styles.card}>
          <Text style={styles.title}>Confirm Food</Text>

          <Text style={styles.label}>Label</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="Food label"
            placeholderTextColor={colors.textDim}
          />

          <Text style={styles.label}>Brand (optional)</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand"
            placeholderTextColor={colors.textDim}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Portion (g)</Text>
              <TextInput
                style={styles.input}
                value={grams}
                onChangeText={(text) => {
                  setManualOverride(false);
                  setGrams(text);
                }}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                placeholder="100"
                placeholderTextColor={colors.textDim}
              />
            </View>
            <View style={styles.rowItemInfo}>
              <Text style={styles.per100Text}>
                Per 100g: {per100.kcal} kcal / {per100.proteinG}g P / {per100.carbsG}g C / {per100.fatsG}g F
              </Text>
            </View>
          </View>

          <View style={styles.macroRow}>
            <MacroInput label="Calories" value={kcal} onChange={(text) => { setManualOverride(true); setKcal(text); }} />
            <MacroInput label="Protein" suffix="g" value={protein} onChange={(text) => { setManualOverride(true); setProtein(text); }} />
          </View>
          <View style={styles.macroRow}>
            <MacroInput label="Carbs" suffix="g" value={carbs} onChange={(text) => { setManualOverride(true); setCarbs(text); }} />
            <MacroInput label="Fats" suffix="g" value={fats} onChange={(text) => { setManualOverride(true); setFats(text); }} />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.text} /> : <Text style={styles.confirmText}>Add</Text>}
            </TouchableOpacity>
          </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function MacroInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <View style={styles.macroInputContainer}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.macroInputWrapper}>
        <TextInput
          style={styles.macroInput}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textDim}
        />
        {suffix && <Text style={styles.macroSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  rowItem: {
    flex: 1,
    marginRight: 12,
  },
  rowItemInfo: {
    flex: 1,
  },
  per100Text: {
    color: colors.textDim,
    fontSize: 12,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroInputContainer: {
    flex: 1,
    marginRight: 12,
  },
  macroInputWrapper: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  macroInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 10,
  },
  macroSuffix: {
    color: colors.textDim,
    fontSize: 14,
    marginLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
  },
  confirmButton: {
    backgroundColor: colors.accent,
  },
  cancelText: {
    color: colors.textDim,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FoodConfirmModal;

