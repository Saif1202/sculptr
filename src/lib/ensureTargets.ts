import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { fullPlanFromProfile } from '../logic/nutrition';

/**
 * Ensure targets exist for a user
 * If targets are missing or invalid, compute them from profile
 * @param uid - User ID
 */
export async function ensureTargetsForUser(uid: string): Promise<void> {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);

    // If doc missing, return silently
    if (!userDoc.exists()) {
      return;
    }

    const data = userDoc.data();
    const profile = data.profile;
    const targets = data.targets;

    // If profile is missing or incomplete, can't compute targets
    if (!profile) {
      return;
    }

    // Check if targets are missing or invalid
    const hasValidTargets = targets && 
      typeof targets.calories === 'number' &&
      typeof targets.proteinG === 'number' &&
      typeof targets.carbsG === 'number' &&
      typeof targets.fatsG === 'number' &&
      targets.calories > 0 &&
      targets.proteinG > 0 &&
      targets.carbsG > 0 &&
      targets.fatsG > 0;

    if (!hasValidTargets) {
      // Compute targets from profile
      const computedTargets = fullPlanFromProfile(profile);
      
      if (computedTargets) {
        // Update targets (merge: true)
        await setDoc(userDocRef, {
          targets: {
            calories: computedTargets.target,
            proteinG: computedTargets.proteinG,
            carbsG: computedTargets.carbsG,
            fatsG: computedTargets.fatG,
          },
        }, { merge: true });
        
        console.log('Targets computed and updated for user', uid);
      } else {
        console.warn('Could not compute targets for user', uid, '- profile may be incomplete');
      }
    }
  } catch (error) {
    // Silently handle errors - just log
    console.warn('Error ensuring targets for user', uid, ':', error);
  }
}

