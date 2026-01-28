import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Fuse from 'fuse.js';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { colors } from '../../src/theme';
import { db } from '../../src/lib/firebase';
import {
  CARDIO_MODES,
  CardioMode,
  CardioPlan,
  CardioInterval,
  WorkoutType,
  lissTemplate,
  zoneTemplate,
  sprintTemplate,
  sumDurationSec,
  lissTargetHR,
} from '../../src/lib/training';

type GoalOption = 'Fat Loss' | 'Muscle Gain' | 'Strength & Conditioning' | 'Maintenance' | 'None';
const goalOptions: GoalOption[] = ['None', 'Fat Loss', 'Muscle Gain', 'Strength & Conditioning', 'Maintenance'];
const workoutTags = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body'];

type ExerciseOption = {
  id: string;
  name: string;
  muscles: string[];
  equipment: string;
  movement: string;
  unit: 'kg' | 'lb';
};

interface WorkoutExerciseEntry {
  exerciseId: string;
  name: string;
  unit: 'kg' | 'lb';
  targetSets: string;
  repTarget: string;
  restSec: string;
  rpeTarget: string;
  notes: string;
}

interface PersistentWorkout {
  id: string;
  name: string;
  goal?: string | null;
  tags?: string[];
  type: WorkoutType;
  exercises: Array<{
    exerciseId: string;
    name: string;
    unit: 'kg' | 'lb';
    targetSets: number;
    repTarget?: string | null;
    restSec?: number | null;
    rpeTarget?: number | null;
    notes?: string | null;
  }>;
  cardio?: CardioPlan | null;
}

interface WorkoutBuilderProps {
  visible: boolean;
  onClose: () => void;
  uid?: string;
  workout?: {
    id: string;
    name: string;
    goal?: string;
    tags?: string[];
    type?: WorkoutType;
    exercises?: Array<{ exerciseId: string; name: string; unit: 'kg' | 'lb'; targetSets: number; repTarget?: string; restSec?: number; rpeTarget?: number; notes?: string }>;
    cardio?: CardioPlan | null;
  } | null;
  availableExercises?: ExerciseOption[];
  presetExercise?: { id: string; name: string; unit: 'kg' | 'lb' } | null;
  onSaved?: () => void;
  onLocalSave?: (workout: PersistentWorkout) => void;
  userAge?: number | null;
}

type BuilderMode = 'new' | 'edit';

export default function WorkoutBuilderModal({
  visible,
  onClose,
  uid,
  workout,
  availableExercises = [],
  presetExercise,
  onSaved,
  onLocalSave,
  userAge,
}: WorkoutBuilderProps) {
  const mode: BuilderMode = workout?.id ? 'edit' : 'new';
  const resolvedAge = Math.max(16, userAge ?? 32);
  const [name, setName] = useState(workout?.name ?? '');
  const [goal, setGoal] = useState<GoalOption>(workout?.goal ? (workout.goal as GoalOption) : 'None');
  const [tags, setTags] = useState<string[]>(workout?.tags ?? []);
  const [workoutType, setWorkoutType] = useState<WorkoutType>(workout?.type ?? 'strength');
  const [saving, setSaving] = useState(false);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [cardioPlan, setCardioPlan] = useState<CardioPlan | null>(workout?.cardio ?? null);

  const [exercises, setExercises] = useState<WorkoutExerciseEntry[]>(() => {
    if (workout?.exercises?.length) {
      return workout.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        name: ex.name,
        unit: ex.unit,
        targetSets: String(ex.targetSets ?? ''),
        repTarget: ex.repTarget ?? '',
        restSec: ex.restSec != null ? String(ex.restSec) : '',
        rpeTarget: ex.rpeTarget != null ? String(ex.rpeTarget) : '',
        notes: ex.notes ?? '',
      }));
    }
    return [];
  });

  useEffect(() => {
    if (visible) {
      setName(workout?.name ?? '');
      setGoal(workout?.goal ? (workout.goal as GoalOption) : 'None');
      setTags(workout?.tags ?? []);
      setWorkoutType(workout?.type ?? 'strength');
      if (workout?.exercises?.length) {
        setExercises(
          workout.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            name: ex.name,
            unit: ex.unit,
            targetSets: String(ex.targetSets ?? ''),
            repTarget: ex.repTarget ?? '',
            restSec: ex.restSec != null ? String(ex.restSec) : '',
            rpeTarget: ex.rpeTarget != null ? String(ex.rpeTarget) : '',
            notes: ex.notes ?? '',
          }))
        );
      } else {
        setExercises([]);
      }
      if (workout?.cardio) {
        setCardioPlan(workout.cardio);
      } else if (workout?.type === 'cardio') {
        setCardioPlan(lissTemplate(resolvedAge));
      } else {
        setCardioPlan(null);
      }
    }
  }, [visible, workout]);

  useEffect(() => {
    if (presetExercise && visible) {
      addExerciseToList(presetExercise.id, presetExercise.name, presetExercise.unit);
    }
  }, [presetExercise, visible]);

  useEffect(() => {
    if (workoutType === 'cardio' && !cardioPlan) {
      setCardioPlan(lissTemplate(resolvedAge));
    }
  }, [workoutType, cardioPlan, resolvedAge]);

  const safeExercises = useMemo(() => (availableExercises ?? []).map((ex) => ({
    id: ex?.id ?? '',
    name: ex?.name ?? 'Exercise',
    muscles: Array.isArray(ex?.muscles) ? ex.muscles : [],
    equipment: ex?.equipment ?? 'Other',
    movement: ex?.movement ?? 'Compound',
    unit: ex?.unit ?? 'kg',
  })), [availableExercises]);

  const fuse = useMemo(() => new Fuse(safeExercises, {
    keys: ['name', 'muscles', 'equipment'],
    threshold: 0.3,
    ignoreLocation: true,
  }), [safeExercises]);

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return safeExercises;
    try {
      return fuse.search(search.trim()).map((res) => res.item);
    } catch {
      return safeExercises;
    }
  }, [safeExercises, fuse, search]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const applyCardioTemplate = (template: 'liss' | 'z2' | 'z34' | 'sprint') => {
    let plan: CardioPlan;
    const preferredMode: CardioMode = workout?.cardio?.mode ?? (workoutType === 'cardio' ? (cardioPlan?.mode ?? 'Stairmaster') : 'Stairmaster');
    if (template === 'liss') {
      plan = lissTemplate(resolvedAge, preferredMode);
    } else if (template === 'z2') {
      plan = zoneTemplate('Z2', resolvedAge, preferredMode);
    } else if (template === 'z34') {
      plan = zoneTemplate('Z3-4', resolvedAge, preferredMode);
    } else {
      plan = sprintTemplate();
    }
    setCardioPlan(plan);
  };

  const updateCardioInterval = <K extends keyof CardioInterval>(index: number, key: K, value: CardioInterval[K]) => {
    if (!cardioPlan) return;
    const next: CardioPlan = {
      ...cardioPlan,
      intervals: cardioPlan.intervals.map((interval, idx) => (idx === index ? { ...interval, [key]: value } : interval)),
    };
    setCardioPlan(next);
  };

  const updateCardioHR = (index: number, field: 'min' | 'max', raw: string) => {
    if (!cardioPlan) return;
    const current = cardioPlan.intervals[index];
    const base = current.targetHR ?? { min: 0, max: 0 };
    const numeric = Number(raw.replace(/[^0-9]/g, ''));
    const nextHR = {
      ...base,
      [field]: Number.isFinite(numeric) ? numeric : undefined,
    } as { min: number; max: number };
    if (!Number.isFinite(nextHR.min!)) delete (nextHR as any).min;
    if (!Number.isFinite(nextHR.max!)) delete (nextHR as any).max;
    updateCardioInterval(index, 'targetHR', Object.keys(nextHR).length ? (nextHR as { min: number; max: number }) : null);
  };

  const parseDurationInput = (text: string): number => {
    const cleaned = text.replace(/[^0-9:]/g, '');
    if (!cleaned.includes(':')) {
      return Number(cleaned) || 0;
    }
    const [m, s] = cleaned.split(':');
    const minutes = Number(m) || 0;
    const seconds = Number(s) || 0;
    return minutes * 60 + seconds;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const addCardioInterval = () => {
    const nextInterval: CardioInterval = {
      type: 'interval',
      label: 'New Interval',
      durationSec: 60,
      targetHR: null,
    };
    setCardioPlan((prev) => {
      if (!prev) {
        return {
          mode: 'Run',
          intervals: [nextInterval],
          cooldownSec: 120,
        };
      }
      return {
        ...prev,
        intervals: [...prev.intervals, nextInterval],
      };
    });
  };

  const removeCardioInterval = (index: number) => {
    if (!cardioPlan) return;
    const next = cardioPlan.intervals.filter((_, idx) => idx !== index);
    setCardioPlan({ ...cardioPlan, intervals: next });
  };

  const updateCardioMode = (mode: CardioMode) => {
    if (!cardioPlan) {
      setCardioPlan({ mode, intervals: [], cooldownSec: 120 });
      return;
    }
    setCardioPlan({ ...cardioPlan, mode });
  };

  const addExerciseToList = (exerciseId: string, label: string, unit: 'kg' | 'lb') => {
    setExercises((prev) => {
      if (prev.some((entry) => entry.exerciseId === exerciseId)) {
        return prev;
      }
      return [
        ...prev,
        {
          exerciseId,
          name: label,
          unit,
          targetSets: '3',
          repTarget: '',
          restSec: '90',
          rpeTarget: '',
          notes: '',
        },
      ];
    });
    setExerciseModalVisible(false);
  };

  const updateExerciseField = (index: number, key: keyof WorkoutExerciseEntry, value: string) => {
    setExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give your workout a descriptive name.');
      return;
    }
    if (workoutType === 'strength') {
      if (!exercises.length) {
        Alert.alert('Add exercises', 'Add at least one exercise to the workout.');
        return;
      }
    } else {
      if (!cardioPlan || !cardioPlan.intervals.length) {
        Alert.alert('Add intervals', 'Define at least one interval for this cardio session.');
        return;
      }
    }

    const strengthPayload = exercises.map((entry, idx) => ({
      exerciseId: entry.exerciseId,
      name: entry.name,
      unit: entry.unit,
      targetSets: Number(entry.targetSets) || 0,
      repTarget: entry.repTarget || null,
      restSec: Number(entry.restSec) || null,
      rpeTarget: Number(entry.rpeTarget) || null,
      notes: entry.notes || null,
      order: idx,
    }));

    const defaultCardioPlan = cardioPlan
      ? {
          mode: cardioPlan.mode,
          intervals: cardioPlan.intervals.map((interval) => ({
            ...interval,
            targetHR: interval.targetHR ?? null,
            targetPace: interval.targetPace ?? null,
            targetSpeedKmh: interval.targetSpeedKmh ?? null,
            targetInclinePct: interval.targetInclinePct ?? null,
            targetLevel: interval.targetLevel ?? null,
          })),
          cooldownSec: cardioPlan.cooldownSec ?? null,
        }
      : null;

    const basePayload: Record<string, any> = {
      name: name.trim(),
      goal: goal === 'None' ? null : goal,
      tags,
      type: workoutType,
      updatedAt: serverTimestamp(),
    };

    if (workoutType === 'strength') {
      basePayload.exercises = strengthPayload;
      basePayload.cardio = null;
    } else {
      basePayload.cardio = defaultCardioPlan;
      basePayload.exercises = [];
    }

    const localId = workout?.id ?? `local-${Date.now()}`;
    const localWorkout: PersistentWorkout = {
      id: localId,
      name: name.trim(),
      goal: goal === 'None' ? null : goal,
      tags,
      type: workoutType,
      exercises: strengthPayload.map(({ order, ...rest }) => rest),
      cardio: defaultCardioPlan,
    };

    setSaving(true);
    try {
      if (!uid) {
        throw new Error('missing-auth');
      }
      if (mode === 'edit' && workout?.id) {
        await setDoc(doc(db, 'users', uid, 'workouts', workout.id), basePayload, { merge: true });
        onLocalSave?.({ ...localWorkout, id: workout.id });
      } else {
        const docRef = await addDoc(collection(db, 'users', uid, 'workouts'), {
          ...basePayload,
          createdAt: serverTimestamp(),
        });
        localWorkout.id = docRef.id;
        onLocalSave?.({ ...localWorkout, id: docRef.id });
      }
      onSaved?.();
      onClose();
    } catch (error: any) {
      console.warn('Workout save failed', error);
      const code = error?.code;
      if (code === 'permission-denied' || code === 'unauthenticated' || error?.message === 'missing-auth') {
        onLocalSave?.(localWorkout);
        Alert.alert('Saved Offline', 'Workout stored on this device while we reconnect.');
        onClose();
      } else {
        Alert.alert('Error', error.message || 'Failed to save workout');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{mode === 'edit' ? 'Edit Workout' : 'Create Workout'}</Text>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Workout Type</Text>
          <View style={styles.typeRow}>
            {(['strength', 'cardio'] as WorkoutType[]).map((typeOption) => (
              <TouchableOpacity
                key={typeOption}
                style={[styles.typeChip, workoutType === typeOption && styles.typeChipActive]}
                onPress={() => setWorkoutType(typeOption)}
              >
                <Text style={styles.typeChipText}>{typeOption === 'strength' ? 'Strength' : 'Cardio'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Workout name"
            placeholderTextColor={colors.textDim}
          />

          <Text style={styles.label}>Goal</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {goalOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, goal === option && styles.chipActive]}
                onPress={() => setGoal(option)}
              >
                <Text style={styles.chipText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Tags</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {workoutTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.chip, tags.includes(tag) && styles.chipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={styles.chipText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {workoutType === 'strength' ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                <TouchableOpacity style={styles.smallButton} onPress={() => setExerciseModalVisible(true)}>
                  <Text style={styles.smallButtonText}>+ Add Exercise</Text>
                </TouchableOpacity>
              </View>

              {exercises.map((entry, index) => (
                <View key={entry.exerciseId} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseName}>{entry.name}</Text>
                    <TouchableOpacity onPress={() => removeExercise(index)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.exerciseRow}>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Sets</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={entry.targetSets}
                        onChangeText={(text) => updateExerciseField(index, 'targetSets', text)}
                        keyboardType="numeric"
                        placeholder="3"
                        placeholderTextColor={colors.textDim}
                      />
                    </View>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Reps</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={entry.repTarget}
                        onChangeText={(text) => updateExerciseField(index, 'repTarget', text)}
                        placeholder="8-12"
                        placeholderTextColor={colors.textDim}
                      />
                    </View>
                  </View>
                  <View style={styles.exerciseRow}>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>Rest (sec)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={entry.restSec}
                        onChangeText={(text) => updateExerciseField(index, 'restSec', text)}
                        keyboardType="numeric"
                        placeholder="90"
                        placeholderTextColor={colors.textDim}
                      />
                    </View>
                    <View style={styles.exerciseField}>
                      <Text style={styles.fieldLabel}>RPE</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={entry.rpeTarget}
                        onChangeText={(text) => updateExerciseField(index, 'rpeTarget', text)}
                        keyboardType="numeric"
                        placeholder="8"
                        placeholderTextColor={colors.textDim}
                      />
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.notesInput]}
                    value={entry.notes}
                    onChangeText={(text) => updateExerciseField(index, 'notes', text)}
                    placeholder="Tempo, equipment setup, cues..."
                    placeholderTextColor={colors.textDim}
                    multiline
                  />
                </View>
              ))}

              {!exercises.length ? (
                <Text style={styles.emptyText}>No exercises yet. Add one to build your workout.</Text>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Cardio Plan</Text>
              </View>
              <View style={styles.modeRow}>
                {CARDIO_MODES.map((modeOption) => (
                  <TouchableOpacity
                    key={modeOption}
                    style={[styles.modeChip, cardioPlan?.mode === modeOption && styles.modeChipActive]}
                    onPress={() => updateCardioMode(modeOption)}
                  >
                    <Text style={styles.modeChipText}>{modeOption}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.templateRow}>
                {(() => {
                  const templates = [
                    { key: 'liss' as const, label: 'LISS' },
                    { key: 'z2' as const, label: 'Zone 2' },
                    { key: 'z34' as const, label: 'Zone 3–4' },
                    { key: 'sprint' as const, label: 'Sprint Session' },
                  ];
                  if (goal === 'Fat Loss') {
                    return [templates[0], templates[1], templates[2], templates[3]];
                  }
                  if (goal === 'Strength & Conditioning') {
                    return [templates[3], templates[2], templates[1], templates[0]];
                  }
                  return templates;
                })().map((template) => (
                  <TouchableOpacity
                    key={template.key}
                    style={styles.templateButton}
                    onPress={() => applyCardioTemplate(template.key)}
                  >
                    <Text style={styles.templateButtonText}>{template.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {cardioPlan ? (
                <>
                  <Text style={styles.summaryText}>
                    Total Planned Time: {formatDuration(sumDurationSec(cardioPlan))}
                  </Text>

                  {cardioPlan.mode === 'Stairmaster' && goal === 'Fat Loss' ? (
                    <Text style={styles.summaryHint}>
                      {(() => {
                        const clamp = lissTargetHR(resolvedAge);
                        return `Aim ≈ 140 BPM (Z2 clamp: ${clamp.min}–${clamp.max} BPM)`;
                      })()}
                    </Text>
                  ) : null}

                  {cardioPlan.intervals.map((interval, index) => (
                    <View key={`${interval.label ?? 'interval'}-${index}`} style={styles.intervalCard}>
                      <View style={styles.intervalHeader}>
                        <TextInput
                          style={styles.intervalLabel}
                          value={interval.label ?? ''}
                          onChangeText={(text) => updateCardioInterval(index, 'label', text)}
                          placeholder={`Interval ${index + 1}`}
                          placeholderTextColor={colors.textDim}
                        />
                        <TouchableOpacity onPress={() => removeCardioInterval(index)}>
                          <Text style={styles.removeText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.intervalRow}>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Duration (mm:ss)</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={formatDuration(interval.durationSec)}
                            onChangeText={(text) => updateCardioInterval(index, 'durationSec', parseDurationInput(text))}
                            placeholder="05:00"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Type</Text>
                          <View style={styles.intervalTypeRow}>
                            {(['steady', 'interval'] as Array<CardioInterval['type']>).map((typeOption) => (
                              <TouchableOpacity
                                key={typeOption}
                                style={[styles.intervalTypeChip, interval.type === typeOption && styles.intervalTypeChipActive]}
                                onPress={() => updateCardioInterval(index, 'type', typeOption)}
                              >
                                <Text style={styles.intervalTypeChipText}>{typeOption}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View style={styles.intervalRow}>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Target HR min</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={interval.targetHR?.min ? String(interval.targetHR.min) : ''}
                            onChangeText={(text) => updateCardioHR(index, 'min', text)}
                            keyboardType="numeric"
                            placeholder="120"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Target HR max</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={interval.targetHR?.max ? String(interval.targetHR.max) : ''}
                            onChangeText={(text) => updateCardioHR(index, 'max', text)}
                            keyboardType="numeric"
                            placeholder="150"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                      </View>

                      <View style={styles.intervalRow}>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Speed (km/h)</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={interval.targetSpeedKmh ? String(interval.targetSpeedKmh) : ''}
                            onChangeText={(text) =>
                              updateCardioInterval(
                                index,
                                'targetSpeedKmh',
                                text ? Number(text) || 0 : null,
                              )
                            }
                            keyboardType="numeric"
                            placeholder="13"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Incline %</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={interval.targetInclinePct ? String(interval.targetInclinePct) : ''}
                            onChangeText={(text) =>
                              updateCardioInterval(
                                index,
                                'targetInclinePct',
                                text ? Number(text) || 0 : null,
                              )
                            }
                            keyboardType="numeric"
                            placeholder="1"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                      </View>

                      <View style={styles.intervalRow}>
                        <View style={styles.intervalField}>
                          <Text style={styles.fieldLabel}>Level</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={interval.targetLevel ? String(interval.targetLevel) : ''}
                            onChangeText={(text) =>
                              updateCardioInterval(
                                index,
                                'targetLevel',
                                text ? Number(text) || 0 : null,
                              )
                            }
                            keyboardType="numeric"
                            placeholder="5"
                            placeholderTextColor={colors.textDim}
                          />
                        </View>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addIntervalButton} onPress={addCardioInterval}>
                    <Text style={styles.smallButtonText}>+ Add Interval</Text>
                  </TouchableOpacity>

                  <Text style={[styles.fieldLabel, styles.cooldownLabel]}>Cooldown (sec)</Text>
                  <TextInput
                    style={styles.input}
                    value={cardioPlan.cooldownSec ? String(cardioPlan.cooldownSec) : ''}
                    onChangeText={(text) =>
                      setCardioPlan({
                        ...cardioPlan,
                        cooldownSec: text ? Number(text) || 0 : null,
                      })
                    }
                    keyboardType="numeric"
                    placeholder="180"
                    placeholderTextColor={colors.textDim}
                  />
                </>
              ) : (
                <Text style={styles.emptyText}>Choose a template to get started.</Text>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} disabled={saving}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerButton, styles.primaryButton, saving && styles.disabledButton]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Save Workout</Text>}
          </TouchableOpacity>
        </View>

        <Modal visible={exerciseModalVisible} animationType="slide" onRequestClose={() => setExerciseModalVisible(false)}>
          <View style={styles.exercisePickerContainer}>
            <View style={styles.exercisePickerHeader}>
              <Text style={styles.modalTitle}>Choose Exercise</Text>
              <TouchableOpacity onPress={() => setExerciseModalVisible(false)}>
                <Text style={styles.closeLink}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={search}
              onChangeText={setSearch}
              placeholder="Search library"
              placeholderTextColor={colors.textDim}
            />
            <ScrollView>
              {filteredExercises.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.exerciseOption}
                  onPress={() => addExerciseToList(item.id, item.name, item.unit)}
                >
                  <Text style={styles.exerciseOptionTitle}>{item.name}</Text>
                  <Text style={styles.exerciseOptionMeta}>{item.muscles.join(' • ')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={() => setExerciseModalVisible(false)}>
              <Text style={styles.secondaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
  },
  content: {
    paddingBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  label: {
    color: colors.textDim,
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    marginBottom: 12,
  },
  chipRow: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  smallButton: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  exerciseCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  removeText: {
    color: colors.danger,
    fontWeight: '600',
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exerciseField: {
    flex: 1,
    marginRight: 10,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
    marginTop: 6,
  },
  emptyText: {
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  footerButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  exercisePickerContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
  },
  exercisePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  closeLink: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  exerciseOption: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseOptionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseOptionMeta: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  typeRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  typeChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    marginRight: 10,
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeChipText: {
    color: colors.text,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  modeChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  templateButton: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  templateButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  summaryHint: {
    color: colors.textDim,
    fontSize: 12,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  intervalCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  addIntervalButton: {
    alignSelf: 'flex-end',
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  intervalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  intervalLabel: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    marginRight: 12,
  },
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  intervalField: {
    flex: 1,
    marginRight: 10,
  },
  intervalTypeRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  intervalTypeChip: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  intervalTypeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  intervalTypeChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  cooldownLabel: {
    marginHorizontal: 20,
  },
});

