import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { fullPlanFromProfile, ActivityLevel, Goal, Sex } from '../../src/logic/nutrition';
import { todayISO, startOfWeekISO } from '../../src/utils/date';
import { getHealthSyncSettings, getSyncedSteps, syncTodaySteps } from '../../src/lib/health';
import Logo from '../../src/components/Logo';

interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

interface UserData {
  profile?: {
    sex?: 'Male' | 'Female';
    weightKg?: number;
    heightCm?: number;
    dob?: string;
    age?: number;
    activity?: string;
    goal?: string;
  };
  targets?: Targets;
  checkin?: {
    stepTarget?: number;
    lissMinPerSession?: number;
    lissSessionsPerWeek?: number;
  };
}

interface MealEntry {
  id: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

interface WorkoutItem {
  id: string;
  name: string;
  type?: 'strength' | 'cardio';
}

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutItem | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [planner, setPlanner] = useState<Record<string, string | undefined> | null>(null);
  const [syncedSteps, setSyncedSteps] = useState<number | null>(null);
  const [healthSettings, setHealthSettings] = useState<any>(null);

  // Get today's day name for planner lookup
  const todayDayName = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[new Date().getDay()];
  }, []);

  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeMeals: (() => void) | null = null;
    let unsubscribeWorkouts: (() => void) | null = null;
    let unsubscribePlanner: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      // Clean up previous firestore listeners
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeMeals) unsubscribeMeals();
      if (unsubscribeWorkouts) unsubscribeWorkouts();
      if (unsubscribePlanner) unsubscribePlanner();
      
      unsubscribeFirestore = null;
      unsubscribeMeals = null;
      unsubscribeWorkouts = null;
      unsubscribePlanner = null;
      
      if (currentUser) {
        setLoading(true);
        setError(null);
        const today = todayISO();
        const weekStart = startOfWeekISO();
        
        // Fetch user data and targets
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeFirestore = onSnapshot(
          userDocRef,
          async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserData;
              setUserData(data);
              if (data.targets) {
                setTargets(data.targets);
                setLoading(false);
                setError(null);
              } else if (data.profile) {
                // Try to calculate targets
                const profileForPlan = {
                  ...data.profile,
                  activity: data.profile.activity as ActivityLevel,
                  goal: data.profile.goal as Goal,
                  sex: data.profile.sex as Sex,
                };
                const computedPlan = fullPlanFromProfile(profileForPlan);
                if (computedPlan) {
                  const targetsPayload = {
                    calories: computedPlan.target,
                    proteinG: computedPlan.proteinG,
                    carbsG: computedPlan.carbsG,
                    fatsG: computedPlan.fatG,
                  };
                  try {
                    await setDoc(userDocRef, { targets: targetsPayload }, { merge: true });
                    setTargets(targetsPayload);
                    setLoading(false);
                    setError(null);
                  } catch (err: any) {
                    console.warn('Error auto-calculating targets:', err);
                    setError('Profile incomplete');
                    setLoading(false);
                  }
                } else {
                  setError('Profile incomplete');
                  setLoading(false);
                }
              } else {
                setError('No targets found');
                setLoading(false);
              }
            } else {
              setError('No targets found');
              setLoading(false);
            }
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          }
        );

        // Load today's meal entries
        const entriesRef = collection(db, 'users', currentUser.uid, 'meals', today, 'entries');
        const entriesQuery = query(entriesRef, orderBy('createdAt', 'desc'));
        unsubscribeMeals = onSnapshot(
          entriesQuery,
          (snapshot) => {
            const entries: MealEntry[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              entries.push({
                id: doc.id,
                calories: data.calories || 0,
                proteinG: data.proteinG || 0,
                carbsG: data.carbsG || 0,
                fatsG: data.fatsG || 0,
              });
            });
            setMealEntries(entries);
          },
          (err) => {
            console.warn('Error loading meal entries:', err);
            setMealEntries([]);
          }
        );

        // Load workouts
        const workoutsRef = collection(db, 'users', currentUser.uid, 'workouts');
        unsubscribeWorkouts = onSnapshot(
          workoutsRef,
          (snapshot) => {
            const workoutList: WorkoutItem[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              workoutList.push({
                id: doc.id,
                name: data.name || 'Unnamed Workout',
                type: data.type || 'strength',
              });
            });
            setWorkouts(workoutList);
          },
          (err) => {
            console.warn('Error loading workouts:', err);
            setWorkouts([]);
          }
        );

        // Load planner to get today's workout
        const plannerRef = doc(db, 'users', currentUser.uid, 'planner', weekStart);
        unsubscribePlanner = onSnapshot(
          plannerRef,
          (snapshot) => {
            const data = snapshot.data();
            if (data?.days) {
              setPlanner(data.days);
            } else {
              setPlanner(null);
            }
          },
          (err) => {
            console.warn('Error loading planner:', err);
            setPlanner(null);
          }
        );
      } else {
        setTargets(null);
        setMealEntries([]);
        setTodayWorkout(null);
        setWorkouts([]);
        setPlanner(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeMeals) unsubscribeMeals();
      if (unsubscribeWorkouts) unsubscribeWorkouts();
      if (unsubscribePlanner) unsubscribePlanner();
    };
  }, []);

  // Calculate today's workout from planner
  useEffect(() => {
    if (planner && workouts.length > 0 && todayDayName) {
      const workoutId = planner[todayDayName];
      if (workoutId) {
        const workout = workouts.find(w => w.id === workoutId);
        setTodayWorkout(workout || null);
      } else {
        setTodayWorkout(null);
      }
    } else {
      setTodayWorkout(null);
    }
  }, [planner, workouts, todayDayName]);

  // Load health sync settings and steps
  useEffect(() => {
    if (!user) return;

    const loadHealthData = async () => {
      try {
        const settings = await getHealthSyncSettings(user.uid);
        setHealthSettings(settings);

        if (settings.enabled && settings.syncSteps) {
          // Try to get synced steps from Firestore first
          const today = todayISO();
          const steps = await getSyncedSteps(user.uid, today);
          
          if (steps !== null) {
            setSyncedSteps(steps);
          } else {
            // If no synced steps, try to sync now
            const synced = await syncTodaySteps(user.uid, settings);
            if (synced !== null) {
              setSyncedSteps(synced);
            }
          }
        }
      } catch (error) {
        console.warn('Error loading health data:', error);
      }
    };

    loadHealthData();
    
    // Sync steps every 5 minutes if enabled
    const syncInterval = setInterval(() => {
      if (user && healthSettings?.enabled && healthSettings?.syncSteps) {
        syncTodaySteps(user.uid, healthSettings).then((steps) => {
          if (steps !== null) {
            setSyncedSteps(steps);
          }
        });
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(syncInterval);
  }, [user, healthSettings]);

  // Calculate meal progress
  const mealProgress = useMemo(() => {
    if (!targets) return null;
    const used = mealEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        proteinG: acc.proteinG + entry.proteinG,
        carbsG: acc.carbsG + entry.carbsG,
        fatsG: acc.fatsG + entry.fatsG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
    );
    return {
      calories: { used: Math.round(used.calories), target: targets.calories, percent: Math.min(100, (used.calories / targets.calories) * 100) },
      protein: { used: Math.round(used.proteinG), target: targets.proteinG, percent: Math.min(100, (used.proteinG / targets.proteinG) * 100) },
      carbs: { used: Math.round(used.carbsG), target: targets.carbsG, percent: Math.min(100, (used.carbsG / targets.carbsG) * 100) },
      fats: { used: Math.round(used.fatsG), target: targets.fatsG, percent: Math.min(100, (used.fatsG / targets.fatsG) * 100) },
    };
  }, [mealEntries, targets]);

  const stepTarget = userData?.checkin?.stepTarget || 10000;
  const stepsProgress = syncedSteps ?? 0;

  const handleRecalculateTargets = async () => {
    if (!user || !userData?.profile) {
      Alert.alert('Error', 'Profile information not available');
      return;
    }

    setRecalculating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        Alert.alert('Error', 'User document not found');
        return;
      }

      const data = userDoc.data();
      const profile = data.profile;

      if (!profile) {
        Alert.alert('Error', 'Profile information not found');
        return;
      }

      const computedPlan = fullPlanFromProfile({
        ...profile,
        activity: profile.activity as ActivityLevel,
        goal: profile.goal as Goal,
        sex: profile.sex as Sex,
      });
      
      if (!computedPlan) {
        Alert.alert('Error', 'Could not calculate targets. Please check your profile information.');
        return;
      }

      await setDoc(userDocRef, {
        targets: {
          calories: computedPlan.target,
          proteinG: computedPlan.proteinG,
          carbsG: computedPlan.carbsG,
          fatsG: computedPlan.fatG,
        },
      }, { merge: true });

      Alert.alert('Success', 'Targets recalculated');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to recalculate targets: ' + error.message);
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Logo size={56} rounded />
          <Text style={styles.caption}>Welcome to SculptR</Text>
        </View>

        {error || !targets ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome to SculptR</Text>
            <Text style={styles.cardText}>
              Your fitness journey starts here. Track your meals, training, and progress.
            </Text>
            {error === 'Profile incomplete' ? (
              <>
                <Text style={styles.errorText}>
                  Unable to calculate targets. Your profile is missing required information.
                </Text>
                <Text style={styles.errorSubtext}>
                  Please ensure your profile includes: sex, weight, height, age, activity level, and goal.
                </Text>
                {userData?.profile && (
                  <TouchableOpacity
                    style={styles.recalcButton}
                    onPress={handleRecalculateTargets}
                    disabled={recalculating}
                  >
                    {recalculating ? (
                      <ActivityIndicator color={colors.textDim} size="small" />
                    ) : (
                      <Text style={styles.recalcButtonText}>Try Recalculating Targets</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            ) : error ? (
              <Text style={styles.errorText}>
                Unable to load targets. Please complete your profile.
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            {/* Quick Actions Row */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => router.push('/(tabs)/meal-plan')}
              >
                <Ionicons name="restaurant" size={24} color={colors.accent} />
                <Text style={styles.quickActionLabel}>Meals</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => router.push('/(tabs)/training?tab=workouts')}
              >
                <Ionicons name="barbell" size={24} color={colors.accent} />
                <Text style={styles.quickActionLabel}>Training</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => router.push('/(tabs)/check-in')}
              >
                <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                <Text style={styles.quickActionLabel}>Check-In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => router.push('/chat')}
              >
                <Ionicons name="chatbubble-ellipses" size={24} color={colors.accent} />
                <Text style={styles.quickActionLabel}>Jim</Text>
              </TouchableOpacity>
            </View>

            {/* Meal Progress Widget */}
            {mealProgress && (
              <TouchableOpacity
                style={styles.widgetCard}
                onPress={() => router.push('/(tabs)/meal-plan')}
                activeOpacity={0.7}
              >
                <View style={styles.widgetHeader}>
                  <View style={styles.widgetTitleRow}>
                    <Ionicons name="restaurant" size={20} color={colors.accent} />
                    <Text style={styles.widgetTitle}>Nutrition Today</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
                </View>
                
                {/* Calories Progress */}
                <View style={styles.progressSection}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Calories</Text>
                    <Text style={styles.progressValue}>
                      {mealProgress.calories.used} / {mealProgress.calories.target}
                    </Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        styles.progressBarCalories,
                        { width: `${Math.min(100, mealProgress.calories.percent)}%` },
                      ]}
                    />
                  </View>
                </View>

                {/* Macros Grid */}
                <View style={styles.macrosGrid}>
                  <View style={styles.macroItem}>
                    <Ionicons name="fitness" size={16} color={colors.accent} />
                    <Text style={styles.macroValue}>{mealProgress.protein.used}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                    <View style={styles.macroProgressBar}>
                      <View
                        style={[
                          styles.macroProgressFill,
                          { width: `${Math.min(100, mealProgress.protein.percent)}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.macroItem}>
                    <Ionicons name="nutrition" size={16} color={colors.accent} />
                    <Text style={styles.macroValue}>{mealProgress.carbs.used}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                    <View style={styles.macroProgressBar}>
                      <View
                        style={[
                          styles.macroProgressFill,
                          { width: `${Math.min(100, mealProgress.carbs.percent)}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.macroItem}>
                    <Ionicons name="water" size={16} color={colors.accent} />
                    <Text style={styles.macroValue}>{mealProgress.fats.used}g</Text>
                    <Text style={styles.macroLabel}>Fats</Text>
                    <View style={styles.macroProgressBar}>
                      <View
                        style={[
                          styles.macroProgressFill,
                          { width: `${Math.min(100, mealProgress.fats.percent)}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Workout Widget */}
            <TouchableOpacity
              style={styles.widgetCard}
              onPress={() => router.push('/(tabs)/training?tab=schedule')}
              activeOpacity={0.7}
            >
              <View style={styles.widgetHeader}>
                <View style={styles.widgetTitleRow}>
                  <Ionicons name="barbell" size={20} color={colors.accent} />
                  <Text style={styles.widgetTitle}>Today's Workout</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </View>
              
              {todayWorkout ? (
                <View style={styles.workoutContent}>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutName}>{todayWorkout.name}</Text>
                    {todayWorkout.type && (
                      <View style={[styles.workoutBadge, todayWorkout.type === 'cardio' && styles.workoutBadgeCardio]}>
                        <Text style={styles.workoutBadgeText}>
                          {todayWorkout.type === 'cardio' ? 'Cardio' : 'Strength'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.startWorkoutButton}
                    onPress={() => router.push('/(tabs)/training?tab=workouts')}
                  >
                    <Ionicons name="play" size={18} color="#FFFFFF" />
                    <Text style={styles.startWorkoutButtonText}>Start Workout</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.workoutContent}>
                  <Text style={styles.noWorkoutText}>No workout scheduled for today</Text>
                  <TouchableOpacity
                    style={styles.scheduleWorkoutButton}
                    onPress={() => router.push('/(tabs)/training?tab=schedule')}
                  >
                    <Ionicons name="calendar" size={16} color={colors.accent} />
                    <Text style={styles.scheduleWorkoutButtonText}>Schedule Workout</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>

            {/* Steps Widget */}
            <TouchableOpacity
              style={styles.widgetCard}
              onPress={() => router.push('/(tabs)/check-in')}
              activeOpacity={0.7}
            >
              <View style={styles.widgetHeader}>
                <View style={styles.widgetTitleRow}>
                  <Ionicons name="footsteps" size={20} color={colors.accent} />
                  <Text style={styles.widgetTitle}>Daily Steps</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </View>
              
              <View style={styles.stepsContent}>
                <Text style={styles.stepsValue}>{stepsProgress.toLocaleString()}</Text>
                <Text style={styles.stepsTarget}>Target: {stepTarget.toLocaleString()}</Text>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      styles.progressBarSteps,
                      { width: `${Math.min(100, (stepsProgress / stepTarget) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.stepsNote}>Connect a fitness tracker to sync steps</Text>
              </View>
            </TouchableOpacity>

            {/* Additional Quick Links */}
            <View style={styles.quickLinksGrid}>
              <TouchableOpacity
                style={styles.quickLinkCard}
                onPress={() => router.push('/(tabs)/training?tab=library')}
              >
                <Ionicons name="library" size={24} color={colors.accent} />
                <Text style={styles.quickLinkLabel}>Exercise Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickLinkCard}
                onPress={() => router.push('/(tabs)/profile')}
              >
                <Ionicons name="person" size={24} color={colors.accent} />
                <Text style={styles.quickLinkLabel}>Profile</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
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
    padding: 16,
    paddingTop: 20,
    paddingBottom: 100,
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  caption: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: colors.textDim,
    marginTop: 12,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  cardText: {
    fontSize: 16,
    color: colors.textDim,
    lineHeight: 24,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    marginTop: 12,
    fontWeight: '600',
  },
  errorSubtext: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 8,
    lineHeight: 18,
  },
  recalcButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  recalcButtonDisabled: {
    opacity: 0.6,
  },
  recalcButtonText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 80,
  },
  quickActionLabel: {
    marginTop: 8,
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  // Widget Cards
  widgetCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  widgetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  widgetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  // Meal Progress
  progressSection: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressBarCalories: {
    backgroundColor: colors.accent,
  },
  progressBarSteps: {
    backgroundColor: '#10B981', // Green for steps
  },
  macrosGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 6,
  },
  macroProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: colors.bgSecondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  macroProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  // Workout Widget
  workoutContent: {
    gap: 12,
  },
  workoutInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  workoutBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  workoutBadgeCardio: {
    backgroundColor: '#10B981',
  },
  workoutBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  startWorkoutButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startWorkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noWorkoutText: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 8,
  },
  scheduleWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  scheduleWorkoutButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  // Steps Widget
  stepsContent: {
    gap: 8,
  },
  stepsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  stepsTarget: {
    fontSize: 14,
    color: colors.textDim,
  },
  stepsNote: {
    fontSize: 12,
    color: colors.textDim,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Quick Links
  quickLinksGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickLinkCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 100,
  },
  quickLinkLabel: {
    marginTop: 8,
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
});

