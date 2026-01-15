import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as fsLimit,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  orderBy,
} from 'firebase/firestore';

import type { FoodItem } from './food';

export type FoodSource = FoodItem['source'];

export interface LibraryFood extends FoodItem {
  id: string;
}

type CachedFood = LibraryFood;

const barcodeCache = new Map<string, CachedFood>();

function mapFoodDoc(snapshot: any): LibraryFood {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    label: data.label ?? '',
    brand: data.brand ?? undefined,
    barcode: data.barcode ?? undefined,
    per100: data.per100 ?? { kcal: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
    defaultServingG: data.defaultServingG ?? undefined,
    tags: data.tags ?? undefined,
    source: data.source ?? 'library',
  };
}

export async function upsertFoodToLibrary(db: Firestore, food: FoodItem): Promise<LibraryFood> {
  const foodsRef = collection(db, 'foods');

  if (food.barcode) {
    const cached = barcodeCache.get(food.barcode);
    if (cached) {
      await updateDoc(doc(db, 'foods', cached.id), {
        label: food.label,
        brand: food.brand ?? null,
        per100: food.per100,
        defaultServingG: food.defaultServingG ?? null,
        tags: food.tags ?? null,
        source: food.source,
        updatedAt: serverTimestamp(),
      });
      return { ...cached, ...food };
    }

    const existingQuery = query(foodsRef, where('barcode', '==', food.barcode), fsLimit(1));
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      const docSnap = existingSnap.docs[0];
      const docRef = docSnap.ref;
      await updateDoc(docRef, {
        label: food.label,
        brand: food.brand ?? null,
        per100: food.per100,
        defaultServingG: food.defaultServingG ?? null,
        tags: food.tags ?? null,
        source: food.source,
        updatedAt: serverTimestamp(),
      });
      const mapped = { id: docSnap.id, ...food };
      barcodeCache.set(food.barcode, mapped);
      return mapped;
    }
  }

  const newDoc = await addDoc(foodsRef, {
    ...food,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const mapped: LibraryFood = { id: newDoc.id, ...food };
  if (food.barcode) {
    barcodeCache.set(food.barcode, mapped);
  }
  return mapped;
}

export async function getFoodByBarcode(db: Firestore, barcode: string): Promise<LibraryFood | null> {
  if (!barcode) return null;
  const cached = barcodeCache.get(barcode);
  if (cached) return cached;

  try {
    const foodsRef = collection(db, 'foods');
    const results = await getDocs(query(foodsRef, where('barcode', '==', barcode), fsLimit(1)));
    if (results.empty) {
      return null;
    }
    const docSnap = results.docs[0];
    const mapped = mapFoodDoc(docSnap);
    barcodeCache.set(barcode, mapped);
    return mapped;
  } catch (error) {
    console.warn('getFoodByBarcode failed:', error);
    return null;
  }
}

export async function addRecentFood(db: Firestore, uid: string, foodId: string): Promise<void> {
  if (!uid || !foodId) return;
  const recentsRef = collection(db, 'users', uid, 'recentFoods');
  await addDoc(recentsRef, {
    foodId,
    at: serverTimestamp(),
  });
}

export async function toggleFavorite(db: Firestore, uid: string, foodId: string, makeFav: boolean): Promise<void> {
  if (!uid || !foodId) return;
  const favRef = doc(db, 'users', uid, 'favoritesFoods', foodId);
  if (makeFav) {
    await setDoc(favRef, {
      createdAt: serverTimestamp(),
    }, { merge: true });
  } else {
    await deleteDoc(favRef).catch(() => undefined);
  }
}

export async function listFavorites(db: Firestore, uid: string): Promise<LibraryFood[]> {
  if (!uid) return [];
  const favsRef = collection(db, 'users', uid, 'favoritesFoods');
  const favDocs = await getDocs(favsRef);

  const foods: LibraryFood[] = [];
  for (const fav of favDocs.docs) {
    const foodDoc = await getDoc(doc(db, 'foods', fav.id));
    if (foodDoc.exists()) {
      foods.push(mapFoodDoc(foodDoc));
    }
  }
  return foods;
}

export async function listRecents(db: Firestore, uid: string, limit: number = 20): Promise<LibraryFood[]> {
  if (!uid) return [];
  const recentsRef = collection(db, 'users', uid, 'recentFoods');
  const recentsSnap = await getDocs(query(recentsRef, orderBy('at', 'desc'), fsLimit(limit)));

  const foods: LibraryFood[] = [];
  for (const recent of recentsSnap.docs) {
    const data = recent.data();
    if (!data.foodId) continue;
    const foodDoc = await getDoc(doc(db, 'foods', data.foodId));
    if (foodDoc.exists()) {
      foods.push(mapFoodDoc(foodDoc));
    }
  }
  return foods;
}

export async function listUserFoods(db: Firestore, uid: string, limit: number = 50): Promise<LibraryFood[]> {
  if (!uid) return [];
  const userFoodsRef = collection(db, 'users', uid, 'foods');
  const snap = await getDocs(query(userFoodsRef, orderBy('createdAt', 'desc'), fsLimit(limit)));

  return snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      label: data.label ?? '',
      brand: data.brand ?? undefined,
      barcode: data.barcode ?? undefined,
      per100: data.per100 ?? { kcal: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
      defaultServingG: data.defaultServingG ?? undefined,
      tags: data.tags ?? undefined,
      source: 'user' as const,
    };
  });
}

export async function createUserFood(db: Firestore, uid: string, food: FoodItem): Promise<LibraryFood> {
  if (!uid) throw new Error('Missing user ID');
  const userFoodsRef = collection(db, 'users', uid, 'foods');
  const docRef = await addDoc(userFoodsRef, {
    ...food,
    createdAt: serverTimestamp(),
  });

  let globalFood: LibraryFood = { id: docRef.id, ...food, source: 'user' };
  try {
    globalFood = await upsertFoodToLibrary(db, { ...food, source: 'user' });
  } catch (error) {
    console.warn('createUserFood upsert failed', error);
  }

  return globalFood;
}

