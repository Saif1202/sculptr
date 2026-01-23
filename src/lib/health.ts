import { Platform, Alert, Linking } from 'react-native';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Try to import health libraries (may not be available in all environments)
let AppleHealthKit: any = null;
let GoogleFit: any = null;

try {
  if (Platform.OS === 'ios') {
    AppleHealthKit = require('react-native-health').default;
  } else if (Platform.OS === 'android') {
    // For Android, we'll use a simpler approach or install react-native-google-fit later
    // GoogleFit = require('react-native-google-fit');
  }
} catch (error) {
  console.log('Health libraries not available (this is normal in Expo Go):', error);
  // In Expo Go, native modules won't be available - this is expected
}

export interface HealthSyncSettings {
  enabled: boolean;
  syncSteps: boolean;
  syncWorkouts: boolean;
  syncWeight: boolean;
  lastSyncDate?: string;
}

export interface HealthData {
  steps?: number;
  workouts?: any[];
  weight?: number;
}

/**
 * Get health sync settings from Firestore
 */
export async function getHealthSyncSettings(uid: string): Promise<HealthSyncSettings> {
  try {
    const settingsRef = doc(db, 'users', uid, 'health', 'sync');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      return settingsDoc.data() as HealthSyncSettings;
    }
    
    // Default settings
    return {
      enabled: false,
      syncSteps: true,
      syncWorkouts: true,
      syncWeight: false,
    };
  } catch (error) {
    console.warn('Error loading health sync settings:', error);
    return {
      enabled: false,
      syncSteps: true,
      syncWorkouts: true,
      syncWeight: false,
    };
  }
}

/**
 * Save health sync settings to Firestore
 */
export async function saveHealthSyncSettings(
  uid: string,
  settings: HealthSyncSettings
): Promise<void> {
  try {
    const settingsRef = doc(db, 'users', uid, 'health', 'sync');
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: new Date(),
    }, { merge: true });
  } catch (error) {
    console.warn('Error saving health sync settings:', error);
    throw error;
  }
}

/**
 * Request health permissions (platform-specific)
 */
export async function requestHealthPermissions(
  permissions: { steps?: boolean; workouts?: boolean; weight?: boolean }
): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      if (!AppleHealthKit) {
        Alert.alert(
          'Development Build Required',
          'Health app sync requires a development build with HealthKit enabled. Please rebuild the app using EAS Build:\n\nnpx eas-cli build --platform ios --profile development\n\nThen install the new build on your device.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return new Promise((resolve) => {
        const readPermissions: string[] = [];
        const writePermissions: string[] = [];

        if (permissions.steps) {
          readPermissions.push(AppleHealthKit.Constants.Permissions.Steps);
        }
        if (permissions.weight) {
          readPermissions.push(AppleHealthKit.Constants.Permissions.Weight);
        }
        if (permissions.workouts) {
          writePermissions.push(AppleHealthKit.Constants.Permissions.Workout);
        }

        const options = {
          permissions: {
            read: readPermissions,
            write: writePermissions,
          },
        };

        AppleHealthKit.initHealthKit(options, (error: any) => {
          if (error) {
            console.warn('HealthKit initialization error:', error);
            Alert.alert(
              'Health App Access',
              'Please grant permissions in Settings > Health > Data Access & Devices > SculptR',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Open Settings', onPress: () => {
                  Linking.openSettings();
                  resolve(false);
                }},
              ]
            );
          } else {
            resolve(true);
          }
        });
      });
    } else if (Platform.OS === 'android') {
      // Android implementation would go here with react-native-google-fit
      Alert.alert(
        'Health App Access',
        'To sync with Google Fit, please install Google Fit and grant permissions when prompted.',
        [{ text: 'OK', onPress: () => {} }]
      );
      return false;
    }
    return false;
  } catch (error) {
    console.warn('Error requesting health permissions:', error);
    return false;
  }
}

/**
 * Read steps from health app (platform-specific)
 */
export async function readStepsFromHealth(date: Date): Promise<number | null> {
  try {
    if (Platform.OS === 'ios') {
      if (!AppleHealthKit) {
        console.warn('HealthKit not available - requires development build');
        return null;
      }
      return new Promise((resolve) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const options = {
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
        };

        AppleHealthKit.getDailyStepCountSamples(options, (error: any, results: any[]) => {
          if (error) {
            console.warn('Error reading steps from HealthKit:', error);
            resolve(null);
            return;
          }

          if (results && results.length > 0) {
            // Sum all step samples for the day
            const totalSteps = results.reduce((sum, sample) => {
              return sum + (sample.value || 0);
            }, 0);
            resolve(Math.round(totalSteps));
          } else {
            resolve(0);
          }
        });
      });
    } else if (Platform.OS === 'android') {
      // Android implementation would go here
      return null;
    }
    return null;
  } catch (error) {
    console.warn('Error reading steps from health app:', error);
    return null;
  }
}

/**
 * Write workout to health app (platform-specific)
 */
export async function writeWorkoutToHealth(workout: {
  name: string;
  startDate: Date;
  endDate: Date;
  type: 'strength' | 'cardio';
  calories?: number;
  distance?: number;
}): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      if (!AppleHealthKit) {
        console.warn('HealthKit not available - requires development build');
        return false;
      }
      return new Promise((resolve) => {
        // Map workout type to HealthKit workout type
        const workoutTypeMap: Record<string, string> = {
          'strength': AppleHealthKit.Constants.WorkoutActivityType.TraditionalStrengthTraining,
          'cardio': AppleHealthKit.Constants.WorkoutActivityType.Running,
        };

        const workoutType = workoutTypeMap[workout.type] || 
          AppleHealthKit.Constants.WorkoutActivityType.Other;

        const workoutData = {
          type: workoutType,
          startDate: workout.startDate.toISOString(),
          endDate: workout.endDate.toISOString(),
          duration: Math.round((workout.endDate.getTime() - workout.startDate.getTime()) / 1000), // seconds
          energyBurned: workout.calories ? { unit: 'kilocalorie', value: workout.calories } : undefined,
          distance: workout.distance ? { unit: 'meter', value: workout.distance * 1000 } : undefined, // convert km to meters
        };

        AppleHealthKit.saveWorkout(workoutData, (error: any) => {
          if (error) {
            console.warn('Error writing workout to HealthKit:', error);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } else if (Platform.OS === 'android') {
      // Android implementation would go here
      return false;
    }
    return false;
  } catch (error) {
    console.warn('Error writing workout to health app:', error);
    return false;
  }
}

/**
 * Sync steps from health app to Firestore
 */
export async function syncStepsToFirestore(
  uid: string,
  dateISO: string,
  steps: number
): Promise<void> {
  try {
    const stepsRef = doc(db, 'users', uid, 'health', 'steps', dateISO);
    await setDoc(stepsRef, {
      steps,
      dateISO,
      syncedAt: new Date(),
      source: Platform.OS === 'ios' ? 'healthkit' : 'googlefit',
    }, { merge: true });
  } catch (error) {
    console.warn('Error syncing steps to Firestore:', error);
    throw error;
  }
}

/**
 * Get synced steps for a date
 */
export async function getSyncedSteps(uid: string, dateISO: string): Promise<number | null> {
  try {
    const stepsRef = doc(db, 'users', uid, 'health', 'steps', dateISO);
    const stepsDoc = await getDoc(stepsRef);
    
    if (stepsDoc.exists()) {
      const data = stepsDoc.data();
      return data?.steps ?? null;
    }
    
    return null;
  } catch (error) {
    console.warn('Error getting synced steps:', error);
    return null;
  }
}

/**
 * Sync steps for today from health app
 */
export async function syncTodaySteps(uid: string, settings: HealthSyncSettings): Promise<number | null> {
  if (!settings.enabled || !settings.syncSteps) {
    return null;
  }

  try {
    const today = new Date();
    const steps = await readStepsFromHealth(today);
    
    if (steps !== null) {
      const todayISO = today.toISOString().split('T')[0];
      await syncStepsToFirestore(uid, todayISO, steps);
      
      // Update last sync date
      await saveHealthSyncSettings(uid, {
        ...settings,
        lastSyncDate: new Date().toISOString(),
      });
      
      return steps;
    }
    
    return null;
  } catch (error) {
    console.warn('Error syncing today steps:', error);
    return null;
  }
}

/**
 * Check if health app is available and authorized
 */
export async function checkHealthAvailability(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios' && AppleHealthKit) {
      return new Promise((resolve) => {
        AppleHealthKit.isAvailable((error: any, available: boolean) => {
          if (error || !available) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } else if (Platform.OS === 'android') {
      // Android check would go here
      return false;
    }
    return false;
  } catch (error) {
    console.warn('Error checking health availability:', error);
    return false;
  }
}
