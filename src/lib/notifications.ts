import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler - only called when module is used
let handlerInitialized = false;
function initializeNotificationHandler() {
  if (!handlerInitialized) {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerInitialized = true;
    } catch (error) {
      console.warn('Failed to initialize notification handler:', error);
    }
  }
}

/**
 * Get day of week as number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
function getDayOfWeekNumber(dayName: string): number {
  const days: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return days[dayName] ?? 1; // Default to Monday
}

/**
 * Ensure notification permissions are granted
 * On Android, creates a default notification channel
 * @returns true if permissions granted, false otherwise
 */
export async function ensurePermissions(): Promise<boolean> {
  try {
    initializeNotificationHandler();

    // Create Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.warn('Failed to ensure permissions:', error);
    return false;
  }
}

/**
 * Schedule daily weight log reminder
 * Cancels previous notification with tag 'daily-weight', then schedules new one
 * @param hour - Hour of day (default 20)
 * @param minute - Minute of hour (default 0)
 */
export async function scheduleDailyWeightReminder(hour: number = 20, minute: number = 0) {
  try {
    // Cancel previous notification with tag
    await Notifications.cancelScheduledNotificationAsync('daily-weight');

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-weight',
      content: {
        title: 'Weight Log Reminder',
        body: 'Log your weight for today',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule daily weight reminder:', error);
  }
}

/**
 * Schedule weekly check-in reminder on specified day
 * Cancels previous notification with tag 'weekly-checkin', then schedules new one
 * @param dayOfWeek - Day of week ('Monday'..'Sunday')
 * @param hour - Hour of day (default 9)
 * @param minute - Minute of hour (default 0)
 */
export async function scheduleWeeklyCheckInReminder(dayOfWeek: string, hour: number = 9, minute: number = 0) {
  try {
    const dayNumber = getDayOfWeekNumber(dayOfWeek);
    
    // Expo uses 1-7 for weekdays (Sunday = 1, Monday = 2, ..., Saturday = 7)
    // Our dayNumber is 0-6 (Sunday = 0, Monday = 1, ..., Saturday = 6)
    const expoWeekday = dayNumber === 0 ? 1 : dayNumber + 1; // Convert to Expo format

    // Cancel previous notification with tag
    await Notifications.cancelScheduledNotificationAsync('weekly-checkin');
    
    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly-checkin',
      content: {
        title: 'Weekly Check-In',
        body: 'Weekly Check-In',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: expoWeekday,
        hour,
        minute,
        repeats: true,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule weekly check-in:', error);
  }
}

/**
 * Ensure daily and weekly notifications are scheduled
 * @param dow - Day of week for weekly check-in (e.g., 'Monday')
 */
export async function ensureDailyAndWeeklyNotifications(dow: string) {
  try {
    const hasPermission = await ensurePermissions();
    if (!hasPermission) {
      console.warn('Notification permissions not granted');
      return;
    }

    await scheduleDailyWeightReminder();
    await scheduleWeeklyCheckInReminder(dow);
  } catch (error) {
    console.warn('Failed to ensure notifications:', error);
  }
}
