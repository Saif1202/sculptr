import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import Fuse from 'fuse.js';

import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import {
  seedGlobalExercises,
  MUSCLES,
  EQUIPMENT,
  MovementType,
  ExerciseRecord,
  createUserExercise,
  WorkoutExercise,
  CardioPlan,
  WorkoutType,
  STARTER_EXERCISES,
} from '../../src/lib/training';
import { startOfWeekISO, weekDatesFromStart, todayISO, addDaysISO } from '../../src/utils/date';
import ExerciseViewModal from '../(modals)/exercise-view';
import WorkoutBuilderModal from '../(modals)/workout-builder';
import StartSessionModal from '../(modals)/start-session';
import SessionHistoryModal, { SessionHistoryItem } from '../(modals)/session-history';
import { calcAge } from '../../src/logic/nutrition';
import { generateWorkoutProgram, GenerateWorkoutProgramPayload, GeneratedWorkout } from '../../src/lib/functions';

type TabKey = 'library' | 'workouts' | 'schedule';

export interface ExerciseItem extends ExerciseRecord {
  id: string;
  source?: ExerciseRecord['source'];
}

interface WorkoutItem {
  id: string;
  name: string;
  tags?: string[];
  goal?: string;
  exercises?: WorkoutExercise[];
  type: WorkoutType;
  cardio?: CardioPlan | null;
}

const dayLabels: Array<{ short: string; full: keyof PlannerDays }> = [
  { short: 'Mon', full: 'Mon' },
  { short: 'Tue', full: 'Tue' },
  { short: 'Wed', full: 'Wed' },
  { short: 'Thu', full: 'Thu' },
  { short: 'Fri', full: 'Fri' },
  { short: 'Sat', full: 'Sat' },
  { short: 'Sun', full: 'Sun' },
];

type PlannerDays = Record<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun', string | undefined>;

const movementFilters: Array<MovementType | 'All'> = ['All', 'Compound', 'Isolation', 'Cardio'];
const plannerDayKeys: Array<keyof PlannerDays> = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fuseOptions = {
  keys: ['name', 'muscles', 'equipment'],
  threshold: 0.3,
  ignoreLocation: true,
  distance: 100,
};

const fallbackExercises: ExerciseItem[] = STARTER_EXERCISES.map((item, index): ExerciseItem => ({
  id: `seed-${index}`,
  name: item.name,
  muscles: item.muscles,
  equipment: item.equipment,
  movement: item.movement,
  instructions: item.instructions,
  cues: item.cues ?? [],
  unit: item.unit,
  isBodyweight: item.isBodyweight,
  demoUrl: item.demoUrl,
  popularity: item.popularity,
  source: 'seed',
}));

const LOCAL_WORKOUTS_KEY = 'sculptr_localWorkouts';

export default function TrainingScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalExercises, setGlobalExercises] = useState<ExerciseItem[]>([]);
  const [userExercises, setUserExercises] = useState<ExerciseItem[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [localWorkouts, setLocalWorkouts] = useState<WorkoutItem[]>([]);
  const [planner, setPlanner] = useState<PlannerDays | null>(null);
  const [weekStart, setWeekStart] = useState<string>(startOfWeekISO());
  const [activeTab, setActiveTab] = useState<TabKey>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [equipmentFilter, setEquipmentFilter] = useState<string>('All');
  const [movementFilter, setMovementFilter] = useState<MovementType | 'All'>('All');
  const [seedAttempted, setSeedAttempted] = useState(false);

  const [selectedExercise, setSelectedExercise] = useState<ExerciseItem | null>(null);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [builderVisible, setBuilderVisible] = useState(false);
  const [builderWorkout, setBuilderWorkout] = useState<WorkoutItem | null>(null);
  const [builderPresetExercise, setBuilderPresetExercise] = useState<{ id: string; name: string; unit: 'kg' | 'lb' } | null>(null);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [sessionWorkout, setSessionWorkout] = useState<WorkoutItem | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [profileAge, setProfileAge] = useState<number | null>(null);

  const [createExerciseVisible, setCreateExerciseVisible] = useState(false);
  const [newExercise, setNewExercise] = useState({
    name: '',
    equipment: EQUIPMENT[0],
    movement: 'Compound' as MovementType,
    unit: 'kg' as 'kg' | 'lb',
    muscles: [] as string[],
    instructions: '',
  });
  const [creatingExercise, setCreatingExercise] = useState(false);

  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignDay, setAssignDay] = useState<keyof PlannerDays | null>(null);
  const [assignWorkoutId, setAssignWorkoutId] = useState<string | null>(null);
  
  const [aiGenerating, setAiGenerating] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [workoutPrefsVisible, setWorkoutPrefsVisible] = useState(false);
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(4);
  const [workoutExperience, setWorkoutExperience] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [generatedWorkouts, setGeneratedWorkouts] = useState<GeneratedWorkout[]>([]);
  const [workoutSelectionVisible, setWorkoutSelectionVisible] = useState(false);
  const [selectedWorkoutSchedule, setSelectedWorkoutSchedule] = useState<Record<string, string>>({});

  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const displayedWorkouts = useMemo(() => (workouts.length ? workouts : localWorkouts), [workouts, localWorkouts]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(LOCAL_WORKOUTS_KEY);
        if (stored && active) {
          const parsed = JSON.parse(stored) as WorkoutItem[];
          const sanitized = parsed.map((item) => ({
            ...item,
            type: item.type ?? 'strength',
            cardio: item.cardio ?? null,
          }));
          setLocalWorkouts(sanitized);
        }
      } catch (error) {
        console.warn('Failed to load local workouts', error);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const persistLocalWorkouts = async (next: WorkoutItem[]) => {
    setLocalWorkouts(next);
    try {
      await SecureStore.setItemAsync(LOCAL_WORKOUTS_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Failed to persist local workouts', error);
    }
  };

  useEffect(() => {
    if (!requestedTab) return;
    const normalized = requestedTab.toLowerCase();
    if (normalized === 'library' || normalized === 'workouts' || normalized === 'schedule') {
      setActiveTab(normalized as TabKey);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (!user) {
      setProfileAge(null);
      setUserProfile(null);
      return;
    }
    const userDoc = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as any;
          const age = data?.profile?.age ?? (data?.profile?.dob ? calcAge(data.profile.dob) : null);
          setProfileAge(age ?? null);
          setUserProfile(data?.profile ?? null);
        }
      },
      () => {
        setProfileAge(null);
        setUserProfile(null);
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || seedAttempted) return;
    setSeedAttempted(true);
    seedGlobalExercises(db).catch((error) => {
      console.warn('Seed failed', error);
      setGlobalExercises((prev) => (prev.length ? prev : fallbackExercises));
    });
  }, [user, seedAttempted]);

  useEffect(() => {
    setLoading(true);
    const globalRef = collection(db, 'exercises');
    const unsubscribe = onSnapshot(
      globalRef,
      (snapshot) => {
        const items: ExerciseItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            name: data.name ?? 'Exercise',
            muscles: Array.isArray(data.muscles) ? data.muscles : [],
            equipment: data.equipment ?? 'Other',
            movement: data.movement ?? 'Compound',
            instructions: data.instructions,
            cues: data.cues ?? [],
            unit: data.unit ?? 'kg',
            isBodyweight: data.isBodyweight,
            demoUrl: data.demoUrl,
            popularity: data.popularity,
            source: data.source ?? 'seed',
          };
        });
        setGlobalExercises(items);
        setLoading(false);
      },
      (error) => {
        console.warn('Global exercises subscription failed', error);
        setGlobalExercises(fallbackExercises);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'exercises');
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const items: ExerciseItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: data.name ?? 'Exercise',
          muscles: Array.isArray(data.muscles) ? data.muscles : [],
          equipment: data.equipment ?? 'Other',
          movement: data.movement ?? 'Compound',
          instructions: data.instructions,
          cues: data.cues ?? [],
          unit: data.unit ?? 'kg',
          isBodyweight: data.isBodyweight,
          demoUrl: data.demoUrl,
          popularity: data.popularity,
          source: data.source ?? 'user',
        };
      });
      setUserExercises(items);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSessionHistory([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    const ref = collection(db, 'users', user.uid, 'sessionHistory');
    const q = query(ref, orderBy('startedAt', 'desc'), limit(25));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: SessionHistoryItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            workoutName: data.workoutName ?? 'Training Session',
            dateISO: data.dateISO ?? 'Unknown Date',
            startedAt: data.startedAt?.toDate ? data.startedAt.toDate() : null,
            setsCount: data.setsCount ?? 0,
            volume: data.volume ?? 0,
            durationSec: data.durationSec ?? null,
            est1RM: data.est1RM ?? undefined,
          };
        });
        setSessionHistory(items);
        setHistoryLoading(false);
      },
      (error) => {
        console.warn('Session history subscription failed', error);
        setSessionHistory([]);
        setHistoryLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const plannerRef = doc(db, 'users', user.uid, 'planner', weekStart);
    const unsubscribe = onSnapshot(plannerRef, (snapshot) => {
      const data = snapshot.data() as any;
      if (data?.days) {
        setPlanner({ ...data.days });
      } else {
        setPlanner(null);
      }
    });
    return () => unsubscribe();
  }, [user, weekStart]);

  const allExercises = useMemo(() => {
    const mapWithSource = (items: ExerciseItem[], source: ExerciseRecord['source']) => items.map((item) => ({ ...item, source }));
    return mapWithSource(globalExercises, 'seed').concat(mapWithSource(userExercises, 'user'));
  }, [globalExercises, userExercises]);

  const fuse = useMemo(() => new Fuse(allExercises, fuseOptions), [allExercises]);

  const filteredExercises = useMemo(() => {
    let items = allExercises;
    if (searchQuery.trim()) {
      items = fuse.search(searchQuery.trim()).map((res) => res.item);
    }
    if (selectedMuscles.length) {
      items = items.filter((item) => selectedMuscles.every((muscle) => item.muscles.includes(muscle as any)));
    }
    if (equipmentFilter !== 'All') {
      items = items.filter((item) => item.equipment === equipmentFilter);
    }
    if (movementFilter !== 'All') {
      items = items.filter((item) => item.movement === movementFilter);
    }
    return items;
  }, [allExercises, fuse, searchQuery, selectedMuscles, equipmentFilter, movementFilter]);

  const weekDates = useMemo(() => weekDatesFromStart(weekStart), [weekStart]);
  const today = todayISO();
  const todayAssignment = planner ? planner[dayLabels[(new Date(today).getDay() + 6) % 7].full] : undefined;

  const toggleMuscle = (muscle: string) => {
    setSelectedMuscles((prev) => (prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]));
  };

  const clearFilters = () => {
    setSelectedMuscles([]);
    setEquipmentFilter('All');
    setMovementFilter('All');
  };

  const handleSaveCustomExercise = async () => {
    if (!user) return;
    if (!newExercise.name.trim()) {
      Alert.alert('Name required', 'Please provide a name for your exercise.');
      return;
    }
    if (!newExercise.muscles.length) {
      Alert.alert('Select muscles', 'Select at least one primary muscle group.');
      return;
    }

    try {
      setCreatingExercise(true);
      await createUserExercise(db, user.uid, {
        name: newExercise.name.trim(),
        equipment: newExercise.equipment as any,
        movement: newExercise.movement,
        muscles: newExercise.muscles as any,
        unit: newExercise.unit,
        instructions: newExercise.instructions.trim() || undefined,
      });

      setNewExercise({
        name: '',
        equipment: EQUIPMENT[0],
        movement: 'Compound',
        unit: 'kg',
        muscles: [],
        instructions: '',
      });
      setCreateExerciseVisible(false);
    } catch (error: any) {
      console.warn('Custom exercise save failed', error);
      Alert.alert('Error', error.message || 'Failed to create exercise');
    } finally {
      setCreatingExercise(false);
    }
  };

  const handleAssignWorkout = async (day: keyof PlannerDays, workoutId?: string) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid, 'planner', weekStart);
      const currentDays: Record<string, string> = {};
      const existing = planner ?? ({} as PlannerDays);
      plannerDayKeys.forEach((key) => {
        const value = existing[key];
        if (value) {
          currentDays[key] = value;
        }
      });
      if (workoutId) {
        currentDays[day] = workoutId;
      } else {
        delete currentDays[day];
      }

      await setDoc(
        docRef,
        {
          days: currentDays,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setAssignModalVisible(false);
      setAssignDay(null);
    } catch (error) {
      console.warn('Assign workout failed', error);
      Alert.alert('Error', 'Could not update schedule');
    }
  };

  const startAssignedWorkout = () => {
    if (!todayAssignment) return;
    const workout = displayedWorkouts.find((w) => w.id === todayAssignment);
    if (workout) {
      setSessionWorkout(workout);
      setSessionVisible(true);
    }
  };

  const handleGenerateAIWorkout = () => {
    if (!user || !userProfile) {
      Alert.alert('Profile Required', 'Please complete your profile first to generate AI workouts.');
      return;
    }
    setWorkoutPrefsVisible(true);
  };

  const handleGenerateWithPrefs = async () => {
    if (!user || !userProfile) return;
    
    setWorkoutPrefsVisible(false);
    setAiGenerating(true);
    try {
      const payload: GenerateWorkoutProgramPayload = {
        profile: {
          goal: userProfile.goal,
          sex: userProfile.sex,
          weightKg: userProfile.weightKg,
          heightCm: userProfile.heightCm,
          age: userProfile.age ?? profileAge ?? undefined,
          activity: userProfile.activity,
        },
        preferences: {
          daysPerWeek: workoutDaysPerWeek,
          experience: workoutExperience,
        },
      };

      const result = await generateWorkoutProgram(payload);
      
      if (result.workouts && result.workouts.length > 0) {
        setGeneratedWorkouts(result.workouts);
        // Initialize schedule with AI suggestions or empty
        const initialSchedule: Record<string, string> = {};
        if (result.schedule) {
          Object.entries(result.schedule).forEach(([day, workoutName]) => {
            const workout = result.workouts.find(w => w.name === workoutName);
            if (workout) {
              initialSchedule[day] = workout.name;
            }
          });
        }
        setSelectedWorkoutSchedule(initialSchedule);
        setWorkoutSelectionVisible(true);
      } else {
        Alert.alert('Error', 'No workouts were generated. Please try again.');
      }
    } catch (error: any) {
      console.error('AI workout generation error:', error);
      Alert.alert('Error', error.message || 'Failed to generate workout program. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyWorkoutSchedule = async () => {
    if (!user || generatedWorkouts.length === 0) return;

    try {
      // Save generated workouts and track IDs
      const workoutIdMap: Record<string, string> = {};
      for (const workout of generatedWorkouts) {
        const workoutId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const workoutRef = doc(db, 'users', user.uid, 'workouts', workoutId);
        
        await setDoc(workoutRef, {
          ...workout,
          id: workoutId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          aiGenerated: true,
        });
        
        workoutIdMap[workout.name] = workoutId;
      }

      // Apply selected schedule
      const plannerRef = doc(db, 'users', user.uid, 'planner', weekStart);
      const currentDays: Record<string, string> = {};
      const existing = planner ?? ({} as PlannerDays);
      plannerDayKeys.forEach((key) => {
        const value = existing[key];
        if (value) {
          currentDays[key] = value;
        }
      });

      // Map selected schedule to workout IDs
      Object.entries(selectedWorkoutSchedule).forEach(([day, workoutName]) => {
        const workoutId = workoutIdMap[workoutName];
        if (workoutId) {
          currentDays[day as keyof PlannerDays] = workoutId;
        }
      });

      await setDoc(
        plannerRef,
        {
          days: currentDays,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setWorkoutSelectionVisible(false);
      setGeneratedWorkouts([]);
      setSelectedWorkoutSchedule({});
      Alert.alert(
        'Success!',
        `Generated ${generatedWorkouts.length} workout${generatedWorkouts.length > 1 ? 's' : ''} and scheduled them!`
      );
    } catch (error: any) {
      console.error('Error applying workout schedule:', error);
      Alert.alert('Error', 'Failed to save workouts. Please try again.');
    }
  };

  const closeBuilder = () => {
    setBuilderVisible(false);
    setBuilderPresetExercise(null);
    setBuilderWorkout(null);
  };

  const handleLocalWorkoutSave = (workout: {
    id: string;
    name: string;
    goal?: string | null;
    tags?: string[];
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
    type: WorkoutType;
    cardio?: CardioPlan | null;
  }) => {
    const next = (() => {
      const existingIndex = localWorkouts.findIndex((w) => w.id === workout.id);
      const entry: WorkoutItem = {
        id: workout.id,
        name: workout.name,
        goal: workout.goal ?? undefined,
        tags: workout.tags ?? [],
        exercises: workout.exercises.map((ex): WorkoutExercise => ({
          exerciseId: ex.exerciseId,
          name: ex.name,
          unit: ex.unit,
          targetSets: ex.targetSets,
          repTarget: ex.repTarget ?? undefined,
          restSec: ex.restSec ?? undefined,
          rpeTarget: ex.rpeTarget ?? undefined,
          notes: ex.notes ?? undefined,
        })),
        type: workout.type,
        cardio: workout.cardio ?? null,
      };
      if (existingIndex >= 0) {
        const copy = [...localWorkouts];
        copy[existingIndex] = entry;
        return copy;
      }
      return [...localWorkouts, entry];
    })();
    persistLocalWorkouts(next);
  };

  const renderLibraryTab = () => (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises"
          placeholderTextColor={colors.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {MUSCLES.map((muscle) => (
          <TouchableOpacity
            key={muscle}
            style={[styles.chip, selectedMuscles.includes(muscle) && styles.chipActive]}
            onPress={() => toggleMuscle(muscle)}
          >
            <Text style={styles.chipText}>{muscle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, equipmentFilter === 'All' && styles.chipActive]}
          onPress={() => setEquipmentFilter('All')}
        >
          <Text style={styles.chipText}>All Equipment</Text>
        </TouchableOpacity>
        {EQUIPMENT.map((equip) => (
          <TouchableOpacity
            key={equip}
            style={[styles.chip, equipmentFilter === equip && styles.chipActive]}
            onPress={() => setEquipmentFilter(equip)}
          >
            <Text style={styles.chipText}>{equip}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {movementFilters.map((movement) => (
          <TouchableOpacity
            key={movement}
            style={[styles.chip, movementFilter === movement && styles.chipActive]}
            onPress={() => setMovementFilter(movement)}
          >
            <Text style={styles.chipText}>{movement}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView style={styles.listContainer}>
          {filteredExercises.map((exercise) => (
            <TouchableOpacity
              key={`${exercise.source}-${exercise.id}`}
              style={styles.exerciseCard}
              onPress={() => {
                setSelectedExercise(exercise as ExerciseItem);
                setExerciseModalVisible(true);
              }}
            >
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <Text style={styles.exerciseMeta}>{exercise.muscles.join(' • ')}</Text>
              <Text style={styles.exerciseMetaSmall}>{exercise.equipment} · {exercise.movement}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.addButton, styles.secondaryButton]}
            onPress={() => setCreateExerciseVisible(true)}
          >
            <Text style={styles.addButtonText}>+ Custom Exercise</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );

  const renderWorkoutsTab = () => (
    <View>
      <TouchableOpacity
        style={[styles.addButton, styles.primaryButton]}
        onPress={() => {
          setBuilderPresetExercise(null);
          setBuilderWorkout(null);
          setBuilderVisible(true);
        }}
      >
        <Text style={styles.addButtonText}>Create Workout</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addButton, styles.secondaryButton, aiGenerating && styles.buttonDisabled]}
        onPress={handleGenerateAIWorkout}
        disabled={aiGenerating || !userProfile}
      >
        {aiGenerating ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <Text style={styles.addButtonText}>🤖 AI Generate Program</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addButton, styles.secondaryButton]}
        onPress={() => setHistoryVisible(true)}
      >
        <Text style={styles.addButtonText}>View Session History</Text>
      </TouchableOpacity>

      <ScrollView style={styles.listContainer}>
        {displayedWorkouts.map((workout) => (
          <View key={workout.id} style={styles.workoutCard}>
            <View style={{ flex: 1 }}>
              <View style={styles.workoutHeader}>
                <Text style={styles.workoutTitle}>{workout.name}</Text>
                <View style={workout.type === 'cardio' ? styles.badgeCardio : styles.badgeStrength}>
                  <Text style={workout.type === 'cardio' ? styles.badgeTextCardio : styles.badgeTextStrength}>
                    {workout.type === 'cardio' ? 'Cardio' : 'Strength'}
                  </Text>
                </View>
              </View>
              {workout.tags?.length ? (
                <Text style={styles.exerciseMetaSmall}>{workout.tags.join(' • ')}</Text>
              ) : null}
              {workout.goal ? (
                <Text style={styles.exerciseMetaSmall}>{workout.goal}</Text>
              ) : null}
              <Text style={styles.exerciseMetaSmall}>
                {workout.type === 'cardio'
                  ? `${workout.cardio?.intervals.length ?? 0} intervals`
                  : `${workout.exercises?.length ?? 0} exercises`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.smallButton, styles.secondaryButton]}
              onPress={() => {
                setBuilderPresetExercise(null);
                setBuilderWorkout(workout);
                setBuilderVisible(true);
              }}
            >
              <Text style={styles.smallButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallButton, styles.primaryButton]}
              onPress={() => {
                setSessionWorkout(workout);
                setSessionVisible(true);
              }}
            >
              <Text style={styles.smallButtonText}>Start</Text>
            </TouchableOpacity>
          </View>
        ))}
        {!displayedWorkouts.length ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No workouts yet. Create one to get started.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  const renderScheduleTab = () => (
    <View>
      <View style={styles.weekHeader}>
        <TouchableOpacity onPress={() => setWeekStart(addDaysISO(weekStart, -7))}>
          <Text style={styles.weekNav}>◀︎ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.weekTitle}>Week of {weekStart}</Text>
        <TouchableOpacity onPress={() => setWeekStart(addDaysISO(weekStart, 7))}>
          <Text style={styles.weekNav}>Next ▶︎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scheduleGrid}>
        {dayLabels.map((day, index) => {
          const dateISO = weekDates[index];
          const assignedId = planner ? planner[day.full] : undefined;
          const workout = displayedWorkouts.find((w) => w.id === assignedId);
          const isToday = dateISO === today;

          return (
            <TouchableOpacity
              key={day.full}
              style={[styles.dayCell, isToday && styles.dayCellToday]}
              onPress={() => {
                setAssignDay(day.full);
                setAssignModalVisible(true);
              }}
            >
              <Text style={styles.dayLabel}>{day.short}</Text>
              <Text style={styles.dayDate}>{dateISO.slice(5)}</Text>
              {workout ? (
                <Text style={styles.dayAssignment}>{workout.name}</Text>
              ) : (
                <Text style={styles.dayAssignmentEmpty}>+</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {todayAssignment ? (
        <TouchableOpacity style={[styles.addButton, styles.primaryButton]} onPress={startAssignedWorkout}>
          <Text style={styles.addButtonText}>Start Today&apos;s Workout</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.emptyStateText}>No workout scheduled for today.</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TabButton label="Library" active={activeTab === 'library'} onPress={() => setActiveTab('library')} />
        <TabButton label="Workouts" active={activeTab === 'workouts'} onPress={() => setActiveTab('workouts')} />
        <TabButton label="Schedule" active={activeTab === 'schedule'} onPress={() => setActiveTab('schedule')} />
      </View>

      <ScrollView style={styles.body}>
        {activeTab === 'library' && renderLibraryTab()}
        {activeTab === 'workouts' && renderWorkoutsTab()}
        {activeTab === 'schedule' && renderScheduleTab()}
      </ScrollView>

      <ExerciseViewModal
        visible={exerciseModalVisible}
        exercise={selectedExercise}
        onClose={() => setExerciseModalVisible(false)}
        onAddToWorkout={(exercise) => {
          setExerciseModalVisible(false);
          setBuilderWorkout(null);
          setBuilderPresetExercise({ id: exercise.id ?? '', name: exercise.name, unit: exercise.unit });
          setBuilderVisible(true);
        }}
        onStartSingle={(exercise) => {
          setExerciseModalVisible(false);
          const sessionEx: WorkoutExercise = {
            exerciseId: exercise.id ?? 'single',
            name: exercise.name,
            unit: exercise.unit ?? 'kg',
            targetSets: 4,
            repTarget: exercise.movement === 'Cardio' ? 'Time' : '8-12',
            restSec: 120,
          };
          setSessionWorkout({
            id: exercise.id ?? 'single',
            name: exercise.name,
            type: 'strength',
            exercises: [sessionEx],
            cardio: null,
          });
          setSessionVisible(true);
        }}
      />

      <WorkoutBuilderModal
        visible={builderVisible}
        onClose={closeBuilder}
        uid={user?.uid}
        workout={builderWorkout}
        availableExercises={allExercises.map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscles: ex.muscles,
          equipment: ex.equipment,
          movement: ex.movement,
          unit: ex.unit,
        }))}
        presetExercise={builderPresetExercise}
        onSaved={() => {
          closeBuilder();
        }}
        onLocalSave={handleLocalWorkoutSave}
        userAge={profileAge}
      />

      <StartSessionModal
        visible={sessionVisible}
        uid={user?.uid}
        onClose={() => {
          setSessionVisible(false);
          setSessionWorkout(null);
        }}
        workout={sessionWorkout}
        name={sessionWorkout?.name}
      />

      <SessionHistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        sessions={sessionHistory}
        loading={historyLoading}
      />

      <Modal visible={createExerciseVisible} animationType="slide" onRequestClose={() => setCreateExerciseVisible(false)}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Custom Exercise</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={newExercise.name}
              onChangeText={(text) => setNewExercise((prev) => ({ ...prev, name: text }))}
              placeholder="Exercise name"
              placeholderTextColor={colors.textDim}
            />

            <Text style={styles.inputLabel}>Primary Muscles</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {MUSCLES.map((muscle) => {
                const active = newExercise.muscles.includes(muscle);
                return (
                  <TouchableOpacity
                    key={muscle}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() =>
                      setNewExercise((prev) => ({
                        ...prev,
                        muscles: active
                          ? prev.muscles.filter((m) => m !== muscle)
                          : [...prev.muscles, muscle],
                      }))
                    }
                  >
                    <Text style={styles.chipText}>{muscle}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Equipment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {EQUIPMENT.map((equip) => (
                <TouchableOpacity
                  key={equip}
                  style={[styles.chip, newExercise.equipment === equip && styles.chipActive]}
                  onPress={() => setNewExercise((prev) => ({ ...prev, equipment: equip as typeof prev.equipment }))}
                >
                  <Text style={styles.chipText}>{equip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Movement</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {(['Compound', 'Isolation', 'Cardio'] as MovementType[]).map((movement) => (
                <TouchableOpacity
                  key={movement}
                  style={[styles.chip, newExercise.movement === movement && styles.chipActive]}
                  onPress={() => setNewExercise((prev) => ({ ...prev, movement }))}
                >
                  <Text style={styles.chipText}>{movement}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Instructions (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={newExercise.instructions}
              onChangeText={(text) => setNewExercise((prev) => ({ ...prev, instructions: text }))}
              placeholder="Key coaching cues"
              placeholderTextColor={colors.textDim}
              multiline
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setCreateExerciseVisible(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, creatingExercise && styles.disabledButton]}
              onPress={handleSaveCustomExercise}
              disabled={creatingExercise}
            >
              {creatingExercise ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <View style={styles.assignOverlay}>
          <View style={styles.assignCard}>
            <Text style={styles.modalTitle}>Assign Workout</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {displayedWorkouts.map((workout) => (
                <TouchableOpacity
                  key={workout.id}
                  style={styles.assignmentButton}
                  onPress={() => assignDay && handleAssignWorkout(assignDay, workout.id)}
                >
                  <Text style={styles.assignmentText}>{workout.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.assignmentButton, styles.secondaryButton]}
                onPress={() => assignDay && handleAssignWorkout(assignDay, undefined)}
              >
                <Text style={styles.assignmentText}>Clear</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setAssignModalVisible(false)}>
              <Text style={styles.secondaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Workout Preferences Modal */}
      <Modal visible={workoutPrefsVisible} transparent animationType="slide" onRequestClose={() => setWorkoutPrefsVisible(false)}>
        <View style={styles.assignOverlay}>
          <View style={styles.assignCard}>
            <Text style={styles.modalTitle}>Workout Preferences</Text>
            <ScrollView>
              <Text style={styles.inputLabel}>Days Per Week</Text>
              <View style={styles.chipRow}>
                {[3, 4, 5, 6].map((days) => (
                  <TouchableOpacity
                    key={days}
                    style={[styles.chip, workoutDaysPerWeek === days && styles.chipActive]}
                    onPress={() => setWorkoutDaysPerWeek(days)}
                  >
                    <Text style={styles.chipText}>{days}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Experience Level</Text>
              <View style={styles.chipRow}>
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.chip, workoutExperience === level && styles.chipActive]}
                    onPress={() => setWorkoutExperience(level)}
                  >
                    <Text style={styles.chipText}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setWorkoutPrefsVisible(false)}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleGenerateWithPrefs}>
                  <Text style={styles.primaryText}>Generate</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Workout Selection & Scheduling Modal */}
      <Modal visible={workoutSelectionVisible} transparent animationType="slide" onRequestClose={() => setWorkoutSelectionVisible(false)}>
        <View style={styles.assignOverlay}>
          <View style={[styles.assignCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Schedule Your Workouts</Text>
            <Text style={[styles.inputLabel, { marginBottom: 16 }]}>Select workouts for each day:</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {plannerDayKeys.map((day) => (
                <View key={day} style={styles.scheduleDayRow}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.workoutPicker}>
                    <TouchableOpacity
                      style={[
                        styles.workoutOption,
                        !selectedWorkoutSchedule[day] && styles.workoutOptionSelected,
                      ]}
                      onPress={() => {
                        const newSchedule = { ...selectedWorkoutSchedule };
                        delete newSchedule[day];
                        setSelectedWorkoutSchedule(newSchedule);
                      }}
                    >
                      <Text style={styles.workoutOptionText}>None</Text>
                    </TouchableOpacity>
                    {generatedWorkouts.map((workout) => (
                      <TouchableOpacity
                        key={workout.name}
                        style={[
                          styles.workoutOption,
                          selectedWorkoutSchedule[day] === workout.name && styles.workoutOptionSelected,
                        ]}
                        onPress={() => {
                          setSelectedWorkoutSchedule({
                            ...selectedWorkoutSchedule,
                            [day]: workout.name,
                          });
                        }}
                      >
                        <Text style={styles.workoutOptionText}>{workout.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setWorkoutSelectionVisible(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleApplyWorkoutSchedule}>
                <Text style={styles.primaryText}>Apply Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
    paddingBottom: 16,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.accent,
  },
  tabButtonText: {
    color: colors.textDim,
    fontSize: 16,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.text,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
  },
  clearButton: {
    marginLeft: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  chipRow: {
    flexGrow: 0,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    marginTop: 8,
  },
  exerciseCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseMeta: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 4,
  },
  exerciseMetaSmall: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  addButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 12,
  },
  addButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.accent,
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.textDim,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workoutTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  badgeCardio: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeStrength: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeTextCardio: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextStrength: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  smallButton: {
    marginLeft: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  smallButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayCell: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  dayCellToday: {
    borderColor: colors.accent,
  },
  dayLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  dayDate: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 8,
  },
  dayAssignment: {
    color: colors.text,
    fontSize: 14,
  },
  dayAssignmentEmpty: {
    color: colors.textDim,
    fontSize: 24,
    textAlign: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  weekNav: {
    color: colors.textDim,
    fontWeight: '600',
  },
  weekTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    paddingTop: 60,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  inputLabel: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    marginBottom: 12,
  },
  multiline: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  secondaryText: {
    color: colors.textDim,
    fontWeight: '600',
  },
  primaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  assignCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    padding: 20,
  },
  assignmentButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  assignmentText: {
    color: colors.text,
    fontWeight: '600',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  optionButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  optionMeta: {
    color: colors.textDim,
    fontSize: 13,
  },
  scheduleDayRow: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  workoutPicker: {
    marginTop: 8,
  },
  workoutOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: colors.card,
  },
  workoutOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  workoutOptionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
});

