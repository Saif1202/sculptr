import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Switch, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../src/lib/firebase';
import { colors } from '../../src/theme';
import { getCustomerInfo, isPremium, restore } from '../../src/lib/billing';
import { getHealthSyncSettings, saveHealthSyncSettings, requestHealthPermissions, syncTodaySteps, type HealthSyncSettings } from '../../src/lib/health';

interface UserData {
  profile?: {
    email?: string;
    tier?: 'free' | 'premium';
  };
}

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [isUserPremium, setIsUserPremium] = useState(false);
  const [healthSettings, setHealthSettings] = useState<HealthSyncSettings>({
    enabled: false,
    syncSteps: true,
    syncWorkouts: true,
    syncWeight: false,
  });
  const [updatingHealth, setUpdatingHealth] = useState(false);

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

    // Load user data from Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserData;
          setUserData(data);
          setLoading(false);
        } else {
          setLoading(false);
        }
      },
      (err) => {
        console.warn('Error loading user data:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user) {
      checkPremiumStatus();
      loadHealthSettings();
    }
  }, [user, userData]);

  const loadHealthSettings = async () => {
    if (!user) return;
    try {
      const settings = await getHealthSyncSettings(user.uid);
      setHealthSettings(settings);
    } catch (error) {
      console.warn('Error loading health settings:', error);
    }
  };

  const checkPremiumStatus = async () => {
    try {
      const customerInfo = await getCustomerInfo();
      const premium = isPremium(customerInfo);
      setIsUserPremium(premium);
    } catch (error) {
      console.warn('Error checking premium status:', error);
      // Fallback to Firestore tier
      setIsUserPremium(userData?.profile?.tier === 'premium');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restore();
      const premium = isPremium(customerInfo);
      setIsUserPremium(premium);
      
      if (premium) {
        // Show success (you can add an Alert here if needed)
        console.log('Purchases restored successfully');
      }
    } catch (error: any) {
      console.error('Error restoring purchases:', error);
    } finally {
      setRestoring(false);
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

  const handleToggleHealthSync = async (enabled: boolean) => {
    if (!user) return;
    
    setUpdatingHealth(true);
    try {
      if (enabled) {
        // Request permissions first
        const granted = await requestHealthPermissions({
          steps: healthSettings.syncSteps,
          workouts: healthSettings.syncWorkouts,
          weight: healthSettings.syncWeight,
        });
        
        // Even if permissions aren't granted, allow user to enable sync
        // They can grant permissions manually later
        if (!granted && Platform.OS === 'ios') {
          Alert.alert(
            'Permissions Required',
            'To sync with Apple Health, please grant permissions when prompted, or go to Settings > Health > Data Access & Devices > SculptR',
            [{ text: 'OK' }]
          );
        }
      }
      
      const newSettings: HealthSyncSettings = {
        ...healthSettings,
        enabled,
      };
      
      await saveHealthSyncSettings(user.uid, newSettings);
      setHealthSettings(newSettings);
      
      // If enabled, try to sync steps immediately
      if (enabled && healthSettings.syncSteps) {
        syncTodaySteps(user.uid, newSettings).catch((err) => {
          console.warn('Failed to sync steps on enable:', err);
        });
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update health sync settings: ' + error.message);
    } finally {
      setUpdatingHealth(false);
    }
  };

  const handleToggleSyncOption = async (option: 'syncSteps' | 'syncWorkouts' | 'syncWeight', value: boolean) => {
    if (!user) return;
    
    setUpdatingHealth(true);
    try {
      const newSettings: HealthSyncSettings = {
        ...healthSettings,
        [option]: value,
      };
      
      await saveHealthSyncSettings(user.uid, newSettings);
      setHealthSettings(newSettings);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update sync options: ' + error.message);
    } finally {
      setUpdatingHealth(false);
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

  const tier = isUserPremium ? 'premium' : (userData?.profile?.tier || 'free');
  const tierDisplay = tier === 'premium' ? 'Premium' : 'Free';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || userData?.profile?.email || 'N/A'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Subscription</Text>
            <View style={styles.tierRow}>
              <View style={[styles.tierBadge, tier === 'premium' && styles.tierBadgePremium]}>
                <Text style={styles.tierText}>{tierDisplay}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.buttonText}>Edit Profile</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Subscription</Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.buttonText}>Manage Subscription</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, restoring && styles.buttonDisabled]}
            onPress={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator color={colors.textDim} size="small" />
            ) : (
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Restore Purchases</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Health Sync Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health App Sync</Text>
          <Text style={styles.sectionDescription}>
            Connect to {Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit'} to sync your fitness data
          </Text>
          
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Enable Health Sync</Text>
                <Text style={styles.settingSubtext}>
                  {healthSettings.enabled ? 'Syncing with health app' : 'Sync disabled'}
                </Text>
              </View>
              {updatingHealth ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Switch
                  value={healthSettings.enabled}
                  onValueChange={handleToggleHealthSync}
                  trackColor={{ false: colors.border, true: colors.accentLight }}
                  thumbColor={healthSettings.enabled ? colors.accent : colors.textDim}
                />
              )}
            </View>
          </View>

          {healthSettings.enabled && (
            <>
              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                      <Ionicons name="footsteps" size={18} color={colors.accent} style={{ marginRight: 8 }} />
                      <Text style={styles.settingLabel}>Sync Steps</Text>
                    </View>
                    <Text style={styles.settingSubtext}>Import daily step count</Text>
                  </View>
                  <Switch
                    value={healthSettings.syncSteps}
                    onValueChange={(value) => handleToggleSyncOption('syncSteps', value)}
                    trackColor={{ false: colors.border, true: colors.accentLight }}
                    thumbColor={healthSettings.syncSteps ? colors.accent : colors.textDim}
                    disabled={updatingHealth}
                  />
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                      <Ionicons name="barbell" size={18} color={colors.accent} style={{ marginRight: 8 }} />
                      <Text style={styles.settingLabel}>Sync Workouts</Text>
                    </View>
                    <Text style={styles.settingSubtext}>Export workouts to health app</Text>
                  </View>
                  <Switch
                    value={healthSettings.syncWorkouts}
                    onValueChange={(value) => handleToggleSyncOption('syncWorkouts', value)}
                    trackColor={{ false: colors.border, true: colors.accentLight }}
                    thumbColor={healthSettings.syncWorkouts ? colors.accent : colors.textDim}
                    disabled={updatingHealth}
                  />
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                      <Ionicons name="scale" size={18} color={colors.accent} style={{ marginRight: 8 }} />
                      <Text style={styles.settingLabel}>Sync Weight</Text>
                    </View>
                    <Text style={styles.settingSubtext}>Import weight measurements</Text>
                  </View>
                  <Switch
                    value={healthSettings.syncWeight}
                    onValueChange={(value) => handleToggleSyncOption('syncWeight', value)}
                    trackColor={{ false: colors.border, true: colors.accentLight }}
                    thumbColor={healthSettings.syncWeight ? colors.accent : colors.textDim}
                    disabled={updatingHealth}
                  />
                </View>
              </View>

              {healthSettings.lastSyncDate && (
                <Text style={styles.lastSyncText}>
                  Last synced: {new Date(healthSettings.lastSyncDate).toLocaleDateString()}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={handleSignOut}
          >
            <Text style={[styles.buttonText, styles.buttonTextDanger]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 40,
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierBadge: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tierBadgePremium: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: colors.textDim,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  settingSubtext: {
    fontSize: 13,
    color: colors.textDim,
    marginTop: 2,
  },
  lastSyncText: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

