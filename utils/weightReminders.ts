import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

const STORAGE_KEY = 'weight-reminder-notification-id';

export async function scheduleDailyWeightReminderIfNeeded(uid: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const qy = query(collection(db, 'weights'), where('uid', '==', uid), where('date', '==', today));
  const snap = await getDocs(qy);
  if (!snap.empty) {
    // cancel any scheduled reminder
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing) {
      try { await Notifications.cancelScheduledNotificationAsync(existing); } catch {}
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    return false;
  }

  // schedule for 20:00 local time today
  const now = new Date();
  const trigger = new Date();
  trigger.setHours(20, 0, 0, 0);
  if (trigger.getTime() <= now.getTime()) {
    // schedule for tomorrow 20:00
    trigger.setDate(trigger.getDate() + 1);
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily weigh-in reminder',
      body: "Don't forget to log today's weight.",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return true;
}

