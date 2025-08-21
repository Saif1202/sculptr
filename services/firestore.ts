import { db } from '@/src/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  firstName?: string;
  lastName?: string;
  email: string;
  dob?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type WeightEntry = { uid: string; date: string; weightKg: number };
export type MealPlan = { uid: string; id?: string; title: string; days: any };
export type TrainingPlan = { uid: string; id?: string; title: string; days: any };
export type Program = 'fat_loss' | 'recomp' | 'muscle_gain' | 'maintenance';
export type CheckIn = {
  uid: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  program: Program;
  caloriesTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  stepsTarget: number;
  lissMinutesTarget: number;
  restDayKcalAdjustment?: number; // fat loss only: -200
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
};
export type Subscription = { uid: string; status: 'active'|'canceled'|'past_due'; renewsAt?: string };

// Profiles
export async function getUserProfile(uid: string) {
  const ref = doc(db, 'profiles', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function setUserProfile(profile: UserProfile) {
  const ref = doc(db, 'profiles', profile.uid);
  await setDoc(ref, { ...profile, updatedAt: serverTimestamp(), createdAt: profile.createdAt ?? serverTimestamp() }, { merge: true });
}

// Weights
export async function getWeights(uid: string) {
  const ref = collection(db, 'weights');
  const q = query(ref, where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<WeightEntry & { id: string }>;
}

export async function addWeight(entry: WeightEntry) {
  await addDoc(collection(db, 'weights'), { ...entry, createdAt: serverTimestamp() });
}

// Meal Plans
export async function getMealPlans(uid: string) {
  const qy = query(collection(db, 'mealPlans'), where('uid', '==', uid));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<MealPlan & { id: string }>;
}

export async function setMealPlan(plan: MealPlan & { id?: string }) {
  if (plan.id) {
    await updateDoc(doc(db, 'mealPlans', plan.id), { ...plan, updatedAt: serverTimestamp() });
  } else {
    await addDoc(collection(db, 'mealPlans'), { ...plan, createdAt: serverTimestamp() });
  }
}

// Training Plans
export async function getTrainingPlans(uid: string) {
  const qy = query(collection(db, 'trainingPlans'), where('uid', '==', uid));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<TrainingPlan & { id: string }>;
}

export async function setTrainingPlan(plan: TrainingPlan & { id?: string }) {
  if (plan.id) {
    await updateDoc(doc(db, 'trainingPlans', plan.id), { ...plan, updatedAt: serverTimestamp() });
  } else {
    await addDoc(collection(db, 'trainingPlans'), { ...plan, createdAt: serverTimestamp() });
  }
}

// Check-ins
export async function getCheckIns(uid: string) {
  const qy = query(collection(db, 'checkIns'), where('uid', '==', uid));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<CheckIn & { id: string }>;
}

export async function addCheckIn(checkIn: CheckIn) {
  await addDoc(collection(db, 'checkIns'), { ...checkIn, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function upsertWeeklyCheckIn(checkIn: CheckIn) {
  // unique by uid + weekStart
  const qy = query(collection(db, 'checkIns'), where('uid', '==', checkIn.uid), where('weekStart', '==', checkIn.weekStart));
  const snap = await getDocs(qy);
  if (snap.empty) {
    await addDoc(collection(db, 'checkIns'), { ...checkIn, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    const docRef = doc(db, 'checkIns', snap.docs[0].id);
    await updateDoc(docRef, { ...checkIn, updatedAt: serverTimestamp() });
  }
}

// Subscriptions
export async function getSubscriptions(uid: string) {
  const qy = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<Subscription & { id: string }>;
}

export async function setSubscription(uid: string, data: Subscription) {
  const ref = doc(db, 'subscriptions', uid);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
}

