import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, collection, setDoc, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, getDocs } from 'firebase/firestore';
import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { todayISO, lastNDaysISO, startOfWeekISO } from '../../src/utils/date';
import {
  Goal,
  analyzeWeights,
  proposeAdjustments,
  applyAdjustments,
  restDayCalories,
  CheckinPlan,
  Targets,
  Adherence,
} from '../../src/lib/plan';
import { ensureDailyAndWeeklyNotifications } from '../../src/lib/notifications';

interface WeightEntry {
  date: string;
  kg: number;
}

interface UserData {
  profile?: {
    goal?: Goal;
    activity?: string;
    tier?: string;
  };
  targets?: Targets;
  checkin?: CheckinPlan & { dayOfWeek?: string };
}

interface PlanHistoryEntry {
  ts: any;
  status: string;
  level: number;
  delta: number;
  proposal: {
    caloriesDelta: number;
    cardioMinutesDelta: number;
    stepsDelta: number;
    macroShift: 'carbs' | 'none';
  };
  snapshot: {
    targets: Targets;
    checkin: CheckinPlan;
  };
}

export default function CheckInScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningCheckIn, setRunningCheckIn] = useState(false);
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  
  const [todayWeight, setTodayWeight] = useState('');
  const today = todayISO();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  // Schedule notifications on mount if user data is available
  useEffect(() => {
    if (userData?.profile && userData?.checkin?.dayOfWeek) {
      ensureDailyAndWeeklyNotifications(userData.checkin.dayOfWeek).catch(err => {
        console.warn('Failed to schedule notifications:', err);
      });
    }
  }, [userData?.checkin?.dayOfWeek]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);

    // Load user data with onSnapshot
    const unsubscribeUser = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserData;
          setUserData(data);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Error loading user data:', err);
        setLoading(false);
      }
    );

    // Load weights using onSnapshot - listen to weights subcollection
    // Get last 7 days dates
    const last7Days = lastNDaysISO(7);
    const weightEntries: WeightEntry[] = [];
    const unsubscribeWeights: (() => void)[] = [];

    // Subscribe to each weight document in last 7 days
    last7Days.forEach((date) => {
      const weightDocRef = doc(db, 'users', user.uid, 'weights', date);
      const unsubscribe = onSnapshot(
        weightDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const entry: WeightEntry = { date, kg: data.kg || 0 };
            const existingIndex = weightEntries.findIndex(w => w.date === date);
            if (existingIndex >= 0) {
              weightEntries[existingIndex] = entry;
            } else {
              weightEntries.push(entry);
            }
            // Sort by date descending (newest first) for display
            weightEntries.sort((a, b) => b.date.localeCompare(a.date));
            setWeights([...weightEntries]);
          } else {
            // Remove if document doesn't exist
            const index = weightEntries.findIndex(w => w.date === date);
            if (index >= 0) {
              weightEntries.splice(index, 1);
              setWeights([...weightEntries]);
            }
          }
        },
        (err) => {
          console.warn(`Error loading weight for ${date}:`, err);
        }
      );
      unsubscribeWeights.push(unsubscribe);
    });

    return () => {
      unsubscribeUser();
      unsubscribeWeights.forEach(unsub => unsub());
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAdherence(null);
      return;
    }
    const weekStart = startOfWeekISO();
    const adherenceRef = doc(db, 'users', user.uid, 'adherence', weekStart);
    const unsubscribe = onSnapshot(
      adherenceRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Adherence;
          setAdherence({
            lissMinutes: data.lissMinutes ?? 0,
            lissSessions: data.lissSessions ?? 0,
            sessionsTotal: data.sessionsTotal ?? 0,
          });
        } else {
          setAdherence({ lissMinutes: 0, lissSessions: 0, sessionsTotal: 0 });
        }
      },
      () => setAdherence({ lissMinutes: 0, lissSessions: 0, sessionsTotal: 0 })
    );
    return () => unsubscribe();
  }, [user]);

  const handleSaveWeight = async () => {
    if (!user || !todayWeight.trim()) {
      Alert.alert('Error', 'Please enter a weight');
      return;
    }

    const weight = parseFloat(todayWeight);
    if (isNaN(weight) || weight <= 0) {
      Alert.alert('Error', 'Please enter a valid weight');
      return;
    }

    setSaving(true);
    try {
      const weightDocRef = doc(db, 'users', user.uid, 'weights', today);
      await setDoc(weightDocRef, {
        kg: weight,
        createdAt: serverTimestamp(),
      });
      
      setTodayWeight('');
      Alert.alert('Success', 'Weight saved');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save weight: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRunCheckIn = async () => {
    if (!user || !userData?.targets || !userData?.checkin || !userData?.profile?.goal) {
      Alert.alert('Error', 'Missing user data');
      return;
    }

    setRunningCheckIn(true);

    try {
      // Determine escalation level
      let escalationLevel: 0 | 1 | 2 = 0;
      
      // Check latest planHistory entry
      const planHistoryRef = collection(db, 'users', user.uid, 'planHistory');
      const historyQuery = query(planHistoryRef, orderBy('ts', 'desc'), limit(1));
      const historySnapshot = await getDocs(historyQuery);

      if (!historySnapshot.empty) {
        const latestDoc = historySnapshot.docs[0];
        const latestEntry = latestDoc.data() as PlanHistoryEntry;
        const latestTs = latestEntry.ts?.toDate?.();
        
        if (latestTs) {
          const daysSince = Math.floor((Date.now() - latestTs.getTime()) / (1000 * 60 * 60 * 24));
          
          // If latest entry is within 4 days and was also 'stagnant', escalate
          if (daysSince <= 4 && latestEntry.status === 'stagnant') {
            escalationLevel = Math.min(2, (latestEntry.level || 0) + 1) as 0 | 1 | 2;
          }
        }
      }

      // Analyze weights
      const analysis = analyzeWeights(weights, userData.profile.goal);
      
      // Handle insufficient data
      if (analysis.status === 'insufficient') {
        Alert.alert('Insufficient Data', 'Need at least 2 weight entries in the last 7 days to run check-in.');
        setRunningCheckIn(false);
        return;
      }

      // Determine drift for Maintenance
      let drift: 'up' | 'down' | undefined = undefined;
      if (userData.profile.goal === 'Maintenance') {
        drift = analysis.delta > 0 ? 'up' : (analysis.delta < 0 ? 'down' : undefined);
      }

      // Propose adjustments
      const proposal = proposeAdjustments(analysis.status, userData.profile.goal, escalationLevel, drift);
      
      // Check if all zeros
      const isAllZeros = proposal.caloriesDelta === 0 && 
                         proposal.cardioMinutesDelta === 0 && 
                         proposal.stepsDelta === 0;

      if (isAllZeros || analysis.status === 'onTrack') {
        Alert.alert('On Track', 'On track — no changes');
        setRunningCheckIn(false);
        return;
      }

      // Apply adjustments
      const { newTargets, newCheckin } = applyAdjustments(
        { targets: userData.targets, checkin: userData.checkin },
        proposal,
        userData.profile.goal
      );

      // Update user document
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        targets: newTargets,
        checkin: newCheckin,
      }, { merge: true });

      // Add to plan history
      await addDoc(planHistoryRef, {
        ts: serverTimestamp(),
        status: analysis.status,
        level: escalationLevel,
        delta: analysis.delta,
        proposal,
        snapshot: {
          targets: newTargets,
          checkin: newCheckin,
        },
      });

      let successMessage = 'Plan updated';
      if (
        userData.profile.goal === 'Fat Loss' &&
        proposal.cardioMinutesDelta > 0 &&
        escalationLevel === 0
      ) {
        successMessage += `\nLISS per session will become ${newCheckin.lissMinPerSession} min.`;
      }

      Alert.alert('Success', successMessage);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to run check-in: ' + error.message);
    } finally {
      setRunningCheckIn(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Analyze weights for display
  const analysis = userData?.profile?.goal 
    ? analyzeWeights(weights, userData.profile.goal)
    : { status: 'insufficient' as const, delta: 0 };

  const statusText: Record<string, string> = {
    onTrack: 'On Track',
    stagnant: 'Stagnant',
    gainTooFast: 'Gain Too Fast',
    lossTooFast: 'Loss Too Fast',
    insufficient: 'Insufficient Data',
  };

  const statusColor: Record<string, string> = {
    onTrack: colors.accent,
    stagnant: '#FFA500',
    gainTooFast: colors.danger,
    lossTooFast: colors.danger,
    insufficient: colors.textDim,
  };

  const todayWeightEntry = weights.find(w => w.date === today);
  const restCal = userData?.targets && userData.profile?.goal
    ? restDayCalories(userData.targets, userData.profile.goal)
    : null;
  const cardioPlan = userData?.checkin;
  const lissMinutesGoal = (cardioPlan?.lissMinPerSession ?? 0) * (cardioPlan?.lissSessionsPerWeek ?? 0);
  const lissSessionsGoal = cardioPlan?.lissSessionsPerWeek ?? 0;
  const adherenceMinutes = adherence?.lissMinutes ?? 0;
  const adherenceSessions = adherence?.lissSessions ?? 0;
  const belowLissMinutes = lissMinutesGoal > 0 && adherenceMinutes < lissMinutesGoal;
  const belowLissSessions = lissSessionsGoal > 0 && adherenceSessions < lissSessionsGoal;
  const showAdherenceWarning =
    analysis.status === 'stagnant' && (belowLissMinutes || belowLissSessions);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Check-In</Text>

        {/* Weight Input Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Log weight</Text>
          <View style={styles.weightInputRow}>
            <TextInput
              style={styles.weightInput}
              placeholder={todayWeightEntry ? `${todayWeightEntry.kg.toFixed(1)} kg` : "Weight (kg)"}
              placeholderTextColor={colors.textDim}
              value={todayWeight}
              onChangeText={setTodayWeight}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={handleSaveWeight}
            />
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveWeight}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Last 7 Days */}
          <Text style={styles.sectionSubtitle}>Last 7 Days</Text>
          {weights.length === 0 ? (
            <Text style={styles.emptyText}>No weights logged yet</Text>
          ) : (
            <View style={styles.weightList}>
              {lastNDaysISO(7).map((date) => {
                const entry = weights.find(w => w.date === date);
                const isToday = date === today;
                return (
                  <View key={date} style={styles.weightListItem}>
                    <Text style={[styles.weightListDate, isToday && styles.weightListDateToday]}>
                      {isToday ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={styles.weightListValue}>
                      {entry ? `${entry.kg.toFixed(1)} kg` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {cardioPlan && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Adherence</Text>
            <View style={styles.adherenceRow}>
              <Text style={styles.adherenceLabel}>LISS Minutes</Text>
              <Text style={styles.adherenceValue}>
                {adherenceMinutes} / {lissMinutesGoal}
              </Text>
            </View>
            <View style={styles.adherenceRow}>
              <Text style={styles.adherenceLabel}>LISS Sessions</Text>
              <Text style={styles.adherenceValue}>
                {adherenceSessions} / {lissSessionsGoal}
              </Text>
            </View>
            <View style={styles.adherenceRow}>
              <Text style={styles.adherenceSecondary}>Cardio sessions logged</Text>
              <Text style={styles.adherenceSecondary}>{adherence?.sessionsTotal ?? 0}</Text>
            </View>
            <Text style={styles.adherenceCaption}>
              Plan: {cardioPlan.lissMinPerSession} min × {cardioPlan.lissSessionsPerWeek} @ ≥140 BPM
            </Text>
          </View>
        )}

        {/* Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor[analysis.status] }]}>
              <Text style={styles.statusText}>{statusText[analysis.status]}</Text>
            </View>
          </View>
          {analysis.status !== 'insufficient' && (
            <Text style={styles.deltaText}>
              {analysis.delta > 0 ? '+' : ''}{analysis.delta.toFixed(1)} kg over 7 days
            </Text>
          )}
          {showAdherenceWarning && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                Stagnant but LISS target not met — consider hitting cardio targets before adjusting calories.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.checkInButton, (runningCheckIn || analysis.status === 'insufficient') && styles.checkInButtonDisabled]}
            onPress={handleRunCheckIn}
            disabled={runningCheckIn || analysis.status === 'insufficient'}
          >
            {runningCheckIn ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.checkInButtonText}>Run Check-In Now</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Plan Card */}
        {userData?.targets && userData?.checkin && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plan</Text>
            
            <View style={styles.planSection}>
              <Text style={styles.planSectionTitle}>Nutrition Targets</Text>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroLabel}>Calories</Text>
                  <Text style={styles.macroValue}>{Math.round(userData.targets.calories)}</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroLabel}>Protein</Text>
                  <Text style={styles.macroValue}>{Math.round(userData.targets.proteinG)}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroLabel}>Carbs</Text>
                  <Text style={styles.macroValue}>{Math.round(userData.targets.carbsG)}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroLabel}>Fats</Text>
                  <Text style={styles.macroValue}>{Math.round(userData.targets.fatsG)}g</Text>
                </View>
              </View>
              
              {userData.profile?.goal === 'Fat Loss' && restCal && (
                <View style={styles.restDayInfo}>
                  <Text style={styles.restDayLabel}>Rest Day Calories:</Text>
                  <Text style={styles.restDayValue}>{restCal}</Text>
                </View>
              )}
            </View>

            <View style={styles.planSection}>
              <Text style={styles.planSectionTitle}>Cardio</Text>
              <Text style={styles.planText}>
                {userData.checkin.lissMinPerSession} min × {userData.checkin.lissSessionsPerWeek} @ ≥140 BPM
              </Text>
            </View>

            <View style={styles.planSection}>
              <Text style={styles.planSectionTitle}>Daily Steps</Text>
              <Text style={styles.planText}>{userData.checkin.stepTarget.toLocaleString()} per day</Text>
            </View>
          </View>
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
    padding: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  weightInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  weightInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    color: colors.text,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDim,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 14,
    fontStyle: 'italic',
  },
  weightList: {
    gap: 8,
  },
  weightListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weightListDate: {
    fontSize: 14,
    color: colors.textDim,
  },
  weightListDateToday: {
    color: colors.accent,
    fontWeight: '600',
  },
  weightListValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  deltaText: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 16,
  },
  checkInButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  checkInButtonDisabled: {
    opacity: 0.6,
  },
  checkInButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  planSection: {
    marginBottom: 20,
  },
  planSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  macroItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  macroLabel: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  restDayInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restDayLabel: {
    fontSize: 14,
    color: colors.textDim,
  },
  restDayValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  planText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  adherenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  adherenceLabel: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  adherenceValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  adherenceSecondary: {
    color: colors.textDim,
    fontSize: 13,
  },
  adherenceCaption: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 12,
  },
  warningBanner: {
    backgroundColor: '#FFC66B20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFC66B',
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    color: '#FFC66B',
    fontSize: 13,
    fontWeight: '600',
  },
});
