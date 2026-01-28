import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { colors } from '../../src/theme';
import { db } from '../../src/lib/firebase';
import { todayISO, nowTS, minutesFromSeconds } from '../../src/utils/date';
import {
  calcSessionSummary,
  WorkoutExercise,
  LoggedSet,
  WorkoutType,
  CardioPlan,
  CardioInterval,
} from '../../src/lib/training';
import { bumpWeeklyAdherence, isLISSSession } from '../../src/lib/plan';
import { getHealthSyncSettings, writeWorkoutToHealth } from '../../src/lib/health';

interface SessionExercise extends WorkoutExercise {
  setsCompleted: number;
  isCustom?: boolean;
}

interface LoggedCardioInterval {
  label?: string;
  actualTimeSec: number;
  avgHR?: number | null;
  speedKmh?: number | null;
  inclinePct?: number | null;
  level?: number | null;
}

interface StartSessionProps {
  visible: boolean;
  onClose: () => void;
  uid?: string;
  workout?: {
    id: string;
    name: string;
    type?: WorkoutType;
    exercises?: WorkoutExercise[];
    cardio?: CardioPlan | null;
  } | null;
  name?: string;
}

const DEFAULT_REST = 120;

export default function StartSessionModal({ visible, onClose, uid, workout, name }: StartSessionProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [customExercises, setCustomExercises] = useState<SessionExercise[]>([]);
  const [activeRest, setActiveRest] = useState<number | null>(null);
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [saving, setSaving] = useState(false);
  const [cardioIndex, setCardioIndex] = useState(0);
  const [cardioElapsed, setCardioElapsed] = useState(0);
  const [cardioRunning, setCardioRunning] = useState(false);
  const [cardioLogs, setCardioLogs] = useState<LoggedCardioInterval[]>([]);
  const [cardioNotes, setCardioNotes] = useState('');
  const [countAsLiss, setCountAsLiss] = useState(false);
  const keepAwakeTag = useRef('cardio-session');

  useEffect(() => {
    if (visible) {
      setStartedAt(Date.now());
      setSets([]);
      setActiveRest(null);
      setCustomExercises([]);
      setCardioIndex(0);
      setCardioElapsed(0);
      setCardioRunning(false);
      setCardioLogs([]);
      setCardioNotes('');
      setCountAsLiss(false);
    }
    return () => stopRestTimer();
  }, [visible]);

  const workoutType: WorkoutType = workout?.type ?? 'strength';
  const isCardio = workoutType === 'cardio';
  const today = todayISO();

  useEffect(() => {
    if (visible && isCardio) {
      activateKeepAwakeAsync(keepAwakeTag.current).catch(() => undefined);
      return () => {
        deactivateKeepAwake(keepAwakeTag.current);
      };
    }
    return () => undefined;
  }, [visible, isCardio]);

  const exercises: SessionExercise[] = useMemo(() => {
    const base = workout?.exercises ?? [];
    if (!base.length) {
      return [
        {
          exerciseId: 'single',
          name: name || workout?.name || 'Exercise',
          unit: 'kg' as 'kg' | 'lb',
          targetSets: 4,
          repTarget: '8-12',
          restSec: DEFAULT_REST,
        },
      ].map((ex) => ({ ...ex, setsCompleted: sets.filter((s) => s.exerciseId === ex.exerciseId).length }));
    }
    const baseExercises = base.map((ex) => ({
      ...ex,
      unit: ex.unit as 'kg' | 'lb',
      setsCompleted: sets.filter((s) => s.exerciseId === ex.exerciseId).length,
      isCustom: false,
    }));

    const custom = customExercises.map((ex) => ({
      ...ex,
      setsCompleted: sets.filter((s) => s.exerciseId === ex.exerciseId).length,
      isCustom: true,
    }));

    return [...baseExercises, ...custom];
  }, [workout, sets, name, customExercises]);

  const cardioIntervals = useMemo(() => {
    if (!isCardio || !workout?.cardio) return [] as CardioInterval[];
    const base = workout.cardio.intervals ?? [];
    if (workout.cardio.cooldownSec) {
      return [
        ...base,
        {
          type: 'steady',
          label: 'Cooldown',
          durationSec: workout.cardio.cooldownSec,
          targetHR: null,
          targetSpeedKmh: null,
          targetInclinePct: null,
          targetLevel: null,
        },
      ];
    }
    return base;
  }, [isCardio, workout]);

  const plannedCardioDescriptor = useMemo(() => {
    if (!isCardio || !workout?.cardio) return null;
    return {
      type: 'cardio',
      cardioSummary: { mode: workout.cardio.mode },
      cardioIntervals: workout.cardio.intervals,
    };
  }, [isCardio, workout]);

  const autoLiss = useMemo(() => isLISSSession(plannedCardioDescriptor), [plannedCardioDescriptor]);

  useEffect(() => {
    if (!visible || !isCardio) return;
    setCardioLogs(
      cardioIntervals.map((interval) => ({
        label: interval.label,
        actualTimeSec: 0,
        avgHR: null,
        speedKmh: interval.targetSpeedKmh ?? null,
        inclinePct: interval.targetInclinePct ?? null,
        level: interval.targetLevel ?? null,
      }))
    );
    setCardioIndex(0);
    setCardioElapsed(0);
    setCardioRunning(false);
  }, [cardioIntervals, visible, isCardio]);

  useEffect(() => {
    if (visible && isCardio) {
      setCountAsLiss(autoLiss);
    }
  }, [autoLiss, visible, isCardio]);

  useEffect(() => {
    if (!visible || !isCardio || !cardioRunning) return;
    const timer = setInterval(() => {
      setCardioElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, isCardio, cardioRunning]);

  useEffect(() => {
    if (!visible || !isCardio || !cardioRunning) return;
    const current = cardioIntervals[cardioIndex];
    if (!current) {
      setCardioRunning(false);
      return;
    }
    if (cardioElapsed >= current.durationSec) {
      finalizeCardioInterval(current.durationSec);
    }
  }, [cardioElapsed, cardioRunning, cardioIndex, cardioIntervals, visible, isCardio]);

  const stopRestTimer = () => {
    if (restInterval.current) {
      clearInterval(restInterval.current);
      restInterval.current = null;
    }
    setActiveRest(null);
  };

  const startRestTimer = (duration: number) => {
    stopRestTimer();
    setActiveRest(duration);
    restInterval.current = setInterval(() => {
      setActiveRest((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          stopRestTimer();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAddSet = (exercise: SessionExercise, weightValue: string, repsValue: string, rpeValue: string) => {
    const weight = Number(weightValue);
    const reps = Number(repsValue);
    const rpe = Number(rpeValue);

    const newSet: LoggedSet = {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      setNumber: sets.filter((s) => s.exerciseId === exercise.exerciseId).length + 1,
      weight: Number.isFinite(weight) ? weight : null,
      reps: Number.isFinite(reps) ? reps : null,
      rpe: Number.isFinite(rpe) ? rpe : undefined,
      doneAt: nowTS(),
      restSec: exercise.restSec ?? DEFAULT_REST,
    };

    setSets((prev) => [...prev, newSet]);
    startRestTimer(exercise.restSec ?? DEFAULT_REST);
  };

  const finalizeCardioInterval = (actualTime: number) => {
    setCardioLogs((prev) => {
      const next = [...prev];
      const current = next[cardioIndex] ?? { actualTimeSec: 0 };
      next[cardioIndex] = {
        ...current,
        label: cardioIntervals[cardioIndex]?.label,
        actualTimeSec: Math.max(actualTime, 0),
      };
      return next;
    });
    setCardioElapsed(0);
    setCardioIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex >= cardioIntervals.length) {
        setCardioRunning(false);
        return cardioIntervals.length;
      }
      return nextIndex;
    });
  };

  const handleCardioStartPause = () => {
    if (!isCardio) return;
    setCardioRunning((prev) => !prev);
  };

  const handleCardioSkip = () => {
    if (!isCardio) return;
    const current = cardioIntervals[cardioIndex];
    if (!current) return;
    finalizeCardioInterval(Math.max(cardioElapsed, 0));
  };

  const handleCardioPrev = () => {
    if (!isCardio) return;
    setCardioRunning(false);
    setCardioElapsed(0);
    setCardioIndex((prev) => {
      const next = Math.max(0, prev - 1);
      setCardioLogs((logs) => {
        const copy = [...logs];
        if (copy[next]) {
          copy[next] = { ...copy[next], actualTimeSec: 0 };
        }
        return copy;
      });
      return next;
    });
  };

  const updateCardioLog = (index: number, key: keyof LoggedCardioInterval, value: number | null) => {
    setCardioLogs((prev) => {
      const next = [...prev];
      const existing = next[index] ?? { actualTimeSec: 0 };
      next[index] = { ...existing, [key]: value };
      return next;
    });
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

  const formatDuration = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleAddExercise = () => {
    const id = `custom-${Date.now()}`;
    setCustomExercises((prev) => [
      ...prev,
      {
        exerciseId: id,
        name: `Exercise ${prev.length + 1}`,
        unit: 'kg' as 'kg' | 'lb',
        targetSets: 3,
        restSec: DEFAULT_REST,
        repTarget: '8-12',
        setsCompleted: 0,
      },
    ]);
  };

  const updateCustomExerciseName = (exerciseId: string, next: string) => {
    setCustomExercises((prev) => prev.map((ex) => (ex.exerciseId === exerciseId ? { ...ex, name: next } : ex)));
    setSets((prev) => prev.map((set) => (set.exerciseId === exerciseId ? { ...set, name: next } : set)));
  };

  const removeCustomExercise = (exerciseId: string) => {
    setCustomExercises((prev) => prev.filter((ex) => ex.exerciseId !== exerciseId));
    setSets((prev) => prev.filter((set) => set.exerciseId !== exerciseId));
  };

  const summary = useMemo(() => calcSessionSummary(sets), [sets]);

  const totalSets = sets.length;

  const handleFinish = async () => {
    if (!uid) {
      onClose();
      return;
    }

    const sessionType: WorkoutType = workout?.type ?? 'strength';
    if (sessionType === 'strength' && !sets.length) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const sessionSummary = calcSessionSummary(sets);
      const today = todayISO();
      const sessionRef = collection(db, 'users', uid, 'sessions', today);
      const payload: Record<string, any> = {
        workoutId: workout?.id ?? null,
        name: workout?.name ?? name ?? 'Training Session',
        startedAt: startedAt ? new Date(startedAt) : serverTimestamp(),
        finishedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        type: sessionType,
      };

      if (sessionType === 'strength') {
        payload.sets = sets;
        payload.volume = sessionSummary.volume;
        payload.est1RM = sessionSummary.bestEst1RM;
      } else if (isCardio && workout?.cardio) {
        const intervals = cardioIntervals;
        const logs = cardioLogs.length === intervals.length ? cardioLogs : cardioLogs.slice(0, intervals.length);
        const totals = logs.map((log, idx) => ({
          actual: log?.actualTimeSec && log.actualTimeSec > 0 ? log.actualTimeSec : intervals[idx]?.durationSec ?? 0,
          avgHR: log?.avgHR ?? null,
          speed: log?.speedKmh ?? intervals[idx]?.targetSpeedKmh ?? null,
        }));
        const totalTimeSec = totals.reduce((sum, entry) => sum + entry.actual, 0);
        const weightedHR = totals.reduce((acc, entry) => {
          if (!entry.avgHR) return acc;
          return acc + entry.avgHR * entry.actual;
        }, 0);
        const totalDistanceKm = totals.reduce((sum, entry) => {
          if (!entry.speed) return sum;
          return sum + (entry.speed * entry.actual) / 3600;
        }, 0);

        payload.cardioSummary = {
          mode: workout.cardio.mode,
          totalTimeSec,
          totalDistanceKm: totalDistanceKm > 0 ? Number(totalDistanceKm.toFixed(2)) : null,
          avgHR: totalTimeSec > 0 && weightedHR > 0 ? Math.round(weightedHR / totalTimeSec) : null,
          notes: cardioNotes.trim() || null,
          targetLISS: countAsLiss,
        };
        payload.cardioIntervals = intervals.map((interval, idx) => {
          const log = logs[idx] ?? { actualTimeSec: 0 };
          return {
            label: interval.label,
            actualTimeSec: log.actualTimeSec && log.actualTimeSec > 0 ? log.actualTimeSec : interval.durationSec,
            avgHR: log.avgHR ?? null,
            speedKmh: log.speedKmh ?? interval.targetSpeedKmh ?? null,
            inclinePct: log.inclinePct ?? interval.targetInclinePct ?? null,
            level: log.level ?? interval.targetLevel ?? null,
          };
        });
      }

      await addDoc(sessionRef, payload);
      if (sessionType === 'cardio') {
        const summaryForDetection = {
          type: 'cardio',
          cardioSummary: payload.cardioSummary,
          cardioIntervals: payload.cardioIntervals,
        };
        const autoDetectedLiss = isLISSSession(summaryForDetection);
        const minutesLogged = minutesFromSeconds(payload.cardioSummary.totalTimeSec ?? 0);
        const minutesToAdd = countAsLiss && autoDetectedLiss ? minutesLogged : 0;
        await bumpWeeklyAdherence(db, uid, today, minutesToAdd, countAsLiss && autoDetectedLiss);
        Alert.alert('Session saved', 'Cardio session recorded successfully.');
      }

      const durationSec = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null;
      await addDoc(collection(db, 'users', uid, 'sessionHistory'), {
        workoutId: workout?.id ?? null,
        workoutName: workout?.name ?? name ?? 'Training Session',
        dateISO: today,
        startedAt: startedAt ? new Date(startedAt) : serverTimestamp(),
        finishedAt: serverTimestamp(),
        setsCount: sets.length,
        volume: sessionSummary.volume,
        est1RM: sessionSummary.bestEst1RM,
        durationSec,
        createdAt: serverTimestamp(),
      });

      // Sync workout to health app if enabled
      try {
        const healthSettings = await getHealthSyncSettings(uid);
        if (healthSettings.enabled && healthSettings.syncWorkouts && startedAt) {
          const startDate = new Date(startedAt);
          const endDate = new Date();
          
          // Estimate calories for cardio (rough estimate: 10 cal/min for moderate intensity)
          let calories: number | undefined;
          if (sessionType === 'cardio' && payload.cardioSummary?.totalTimeSec) {
            const minutes = payload.cardioSummary.totalTimeSec / 60;
            calories = Math.round(minutes * 10); // Rough estimate
          }

          // Calculate distance for cardio
          let distance: number | undefined;
          if (sessionType === 'cardio' && payload.cardioSummary?.totalDistanceKm) {
            distance = payload.cardioSummary.totalDistanceKm;
          }

          await writeWorkoutToHealth({
            name: workout?.name ?? name ?? 'Training Session',
            startDate,
            endDate,
            type: sessionType,
            calories,
            distance,
          });
        }
      } catch (healthError) {
        // Don't fail the session save if health sync fails
        console.warn('Failed to sync workout to health app:', healthError);
      }
    } catch (error) {
      console.warn('Failed to log session', error);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  if (!visible) return null;

  const renderCardioContent = () => {
    const current = cardioIntervals[cardioIndex] ?? null;
    return (
      <>
        <View style={styles.cardioHeader}>
          <Text style={styles.cardioLabel}>{current?.label ?? 'Intervals Complete'}</Text>
          {current ? (
            <Text style={styles.cardioTimer}>{formatDuration(Math.max(current.durationSec - cardioElapsed, 0))}</Text>
          ) : (
            <Text style={styles.cardioTimer}>00:00</Text>
          )}
          {current?.targetHR ? (
            <Text style={styles.cardioTarget}>Target HR: {current.targetHR.min}–{current.targetHR.max} BPM</Text>
          ) : null}
          {current?.targetSpeedKmh ? (
            <Text style={styles.cardioTarget}>
              {`Speed ${current.targetSpeedKmh} km/h`}
              {current?.targetInclinePct != null ? ` · Incline ${current.targetInclinePct}%` : ''}
              {current?.targetLevel != null ? ` · Level ${current.targetLevel}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardioControls}>
          <TouchableOpacity style={[styles.button, styles.secondaryControl]} onPress={handleCardioPrev}>
            <Text style={styles.secondaryText}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.primaryControl]}
            onPress={handleCardioStartPause}
          >
            <Text style={styles.primaryText}>{cardioRunning ? 'Pause' : 'Start'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondaryControl]} onPress={handleCardioSkip}>
            <Text style={styles.secondaryText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity
            style={styles.lissToggle}
            onPress={() => setCountAsLiss((prev) => !prev)}
          >
            <View style={[styles.checkbox, countAsLiss && styles.checkboxChecked]}>
              {countAsLiss ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxLabel}>Count as LISS (≥140 BPM steady)</Text>
          </TouchableOpacity>

          {cardioIntervals.map((interval, index) => {
            const log = cardioLogs[index] ?? { actualTimeSec: interval.durationSec };
            return (
              <View key={`${interval.label ?? 'cardio'}-${index}`} style={styles.intervalLogCard}>
                <Text style={styles.exerciseName}>{interval.label ?? `Interval ${index + 1}`}</Text>
                <View style={styles.intervalRow}>
                  <View style={styles.intervalField}>
                    <Text style={styles.fieldLabel}>Actual (mm:ss)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={formatDuration(log.actualTimeSec || interval.durationSec)}
                      onChangeText={(text) =>
                        updateCardioLog(index, 'actualTimeSec', parseDurationInput(text))
                      }
                      placeholder="05:00"
                      placeholderTextColor={colors.textDim}
                    />
                  </View>
                  <View style={styles.intervalField}>
                    <Text style={styles.fieldLabel}>Avg HR</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={log.avgHR ? String(log.avgHR) : ''}
                      onChangeText={(text) =>
                        updateCardioLog(index, 'avgHR', text ? Number(text) || 0 : null)
                      }
                      keyboardType="numeric"
                      placeholder="140"
                      placeholderTextColor={colors.textDim}
                    />
                  </View>
                </View>

                <View style={styles.intervalRow}>
                  <View style={styles.intervalField}>
                    <Text style={styles.fieldLabel}>Speed (km/h)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={log.speedKmh ? String(log.speedKmh) : ''}
                      onChangeText={(text) =>
                        updateCardioLog(index, 'speedKmh', text ? Number(text) || 0 : null)
                      }
                      keyboardType="numeric"
                      placeholder={interval.targetSpeedKmh ? String(interval.targetSpeedKmh) : '13'}
                      placeholderTextColor={colors.textDim}
                    />
                  </View>
                  <View style={styles.intervalField}>
                    <Text style={styles.fieldLabel}>Incline %</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={log.inclinePct ? String(log.inclinePct) : ''}
                      onChangeText={(text) =>
                        updateCardioLog(index, 'inclinePct', text ? Number(text) || 0 : null)
                      }
                      keyboardType="numeric"
                      placeholder={interval.targetInclinePct != null ? String(interval.targetInclinePct) : '0'}
                      placeholderTextColor={colors.textDim}
                    />
                  </View>
                </View>

                <View style={styles.intervalRow}>
                  <View style={styles.intervalField}>
                    <Text style={styles.fieldLabel}>Level</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={log.level ? String(log.level) : ''}
                      onChangeText={(text) =>
                        updateCardioLog(index, 'level', text ? Number(text) || 0 : null)
                      }
                      keyboardType="numeric"
                      placeholder={interval.targetLevel != null ? String(interval.targetLevel) : '5'}
                      placeholderTextColor={colors.textDim}
                    />
                  </View>
                </View>
              </View>
            );
          })}

          <Text style={styles.fieldLabel}>Session Notes</Text>
          <TextInput
            style={[styles.fieldInput, styles.notesInput]}
            value={cardioNotes}
            onChangeText={setCardioNotes}
            placeholder="How did it feel? Pace adjustments, etc."
            placeholderTextColor={colors.textDim}
            multiline
          />
        </ScrollView>
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>{workout?.name ?? name ?? 'Training Session'}</Text>
            {workout?.tags && workout.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {workout.tags.map((tag, idx) => (
                  <View key={idx} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {isCardio ? (
          renderCardioContent()
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              {exercises.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No exercises in this workout</Text>
                  <TouchableOpacity style={[styles.button, styles.addExerciseButton]} onPress={handleAddExercise}>
                    <Text style={styles.addSetText}>+ Add Exercise</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {exercises.map((exercise) => (
                    <ExerciseEntry
                      key={exercise.exerciseId}
                      exercise={exercise}
                      onAddSet={handleAddSet}
                      onRename={exercise.isCustom ? (name) => updateCustomExerciseName(exercise.exerciseId, name) : undefined}
                      onRemove={exercise.isCustom ? () => removeCustomExercise(exercise.exerciseId) : undefined}
                    />
                  ))}
                  <TouchableOpacity style={[styles.button, styles.addExerciseButton]} onPress={handleAddExercise}>
                    <Text style={styles.addSetText}>+ Add Exercise</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>

            {activeRest != null ? (
              <View style={styles.restBanner}>
                <View style={styles.restContent}>
                  <Text style={styles.restText}>⏱ Rest: {activeRest}s</Text>
                  <TouchableOpacity onPress={stopRestTimer} style={styles.skipButton}>
                    <Text style={styles.skipText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {totalSets > 0 && (
              <View style={styles.summaryBar}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Sets</Text>
                  <Text style={styles.summaryValue}>{totalSets}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Volume</Text>
                  <Text style={styles.summaryValue}>{summary.volume.toFixed(1)} {exercises[0]?.unit || 'kg'}</Text>
                </View>
                {summary.bestEst1RM && (
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Est. 1RM</Text>
                    <Text style={styles.summaryValue}>{summary.bestEst1RM.toFixed(1)} {exercises[0]?.unit || 'kg'}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.button, styles.cancel]} onPress={onClose} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.confirm, saving && styles.buttonDisabled]}
            onPress={handleFinish}
            disabled={saving || (workoutType === 'strength' && !sets.length)}
          >
            {saving ? <ActivityIndicator color={colors.text} /> : <Text style={styles.confirmText}>Finish Workout</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ExerciseEntry({
  exercise,
  onAddSet,
  onRename,
  onRemove,
}: {
  exercise: SessionExercise;
  onAddSet: (exercise: SessionExercise, weight: string, reps: string, rpe: string) => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
}) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [name, setName] = useState(exercise.name);

  useEffect(() => {
    setName(exercise.name);
  }, [exercise.name]);

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        {onRename ? (
          <TextInput
            style={styles.exerciseNameInput}
            value={name}
            onChangeText={setName}
            onBlur={() => {
              if (!name.trim()) {
                setName(exercise.name);
              } else {
                onRename(name.trim());
              }
            }}
            placeholder="Exercise name"
            placeholderTextColor={colors.textDim}
          />
        ) : (
          <Text style={styles.exerciseName}>{exercise.name}</Text>
        )}
        {onRemove ? (
          <TouchableOpacity onPress={onRemove}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.exerciseDetails}>
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Target Sets</Text>
            <Text style={styles.detailValue}>{exercise.targetSets}</Text>
          </View>
          {exercise.repTarget && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Reps</Text>
              <Text style={styles.detailValue}>{exercise.repTarget}</Text>
            </View>
          )}
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Rest</Text>
            <Text style={styles.detailValue}>{exercise.restSec ?? DEFAULT_REST}s</Text>
          </View>
          {exercise.rpeTarget && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>RPE</Text>
              <Text style={styles.detailValue}>{exercise.rpeTarget}</Text>
            </View>
          )}
        </View>
        {exercise.notes && (
          <Text style={styles.exerciseNotes}>{exercise.notes}</Text>
        )}
        <Text style={styles.exerciseMeta}>
          Sets completed: {exercise.setsCompleted} / {exercise.targetSets}
        </Text>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.field}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder={`Weight (${exercise.unit})`}
          placeholderTextColor={colors.textDim}
        />
        <TextInput
          style={styles.field}
          value={reps}
          onChangeText={setReps}
          keyboardType="numeric"
          placeholder="Reps"
          placeholderTextColor={colors.textDim}
        />
        <TextInput
          style={styles.field}
          value={rpe}
          onChangeText={setRpe}
          keyboardType="numeric"
          placeholder="RPE"
          placeholderTextColor={colors.textDim}
        />
      </View>
      <TouchableOpacity
        style={[styles.button, styles.addSetButton]}
        onPress={() => {
          onAddSet(exercise, weight, reps, rpe);
          setWeight('');
          setReps('');
          setRpe('');
        }}
      >
        <Text style={styles.addSetText}>Log Set ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
    marginLeft: 12,
  },
  closeButtonText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '300',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.textDim,
    fontSize: 16,
    marginBottom: 20,
  },
  content: {
    paddingBottom: 120,
    paddingHorizontal: 20,
  },
  exerciseCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseNameInput: {
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
  exerciseDetails: {
    marginTop: 8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  detailItem: {
    backgroundColor: colors.bg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseNotes: {
    color: colors.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
    paddingLeft: 4,
  },
  exerciseMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  field: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    marginRight: 8,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  addSetButton: {
    backgroundColor: colors.accent,
  },
  addSetText: {
    color: colors.text,
    fontWeight: '600',
  },
  addExerciseButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  restBanner: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  restContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  stopRest: {
    color: colors.danger,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  cancel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirm: {
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  confirmText: {
    color: colors.text,
    fontWeight: '600',
  },
  removeText: {
    color: colors.danger,
    fontWeight: '600',
  },
  summaryBar: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
  },
  skipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cardioHeader: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  cardioLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  cardioTimer: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    marginTop: 6,
  },
  cardioTarget: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 4,
  },
  cardioControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  primaryControl: {
    flex: 1,
    backgroundColor: colors.accent,
    marginHorizontal: 8,
  },
  secondaryControl: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 4,
  },
  intervalLogCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  intervalField: {
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
    height: 100,
    textAlignVertical: 'top',
  },
  primaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  lissToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkboxMark: {
    color: colors.text,
    fontWeight: '700',
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
});

