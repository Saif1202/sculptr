import { Firestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { startOfWeekISO, minutesFromSeconds } from '../utils/date';

export type Goal = 'Fat Loss' | 'Strength & Conditioning' | 'Muscle Gain' | 'Maintenance';

export interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

export interface CheckinPlan {
  stepTarget: number;
  lissMinPerSession: number;
  lissSessionsPerWeek: number;
}

export type EscalationLevel = 0 | 1 | 2;

interface WeightEntry {
  date: string;
  kg: number;
}

export interface Adherence {
  lissMinutes: number;
  lissSessions: number;
  sessionsTotal?: number;
}

interface AdjustmentProposal {
  caloriesDelta: number;
  cardioMinutesDelta: number;
  stepsDelta: number;
  macroShift: 'carbs' | 'none';
}

const CARDIO_STEADY_MODES = ['treadmill', 'stairmaster', 'bike', 'run', 'row', 'rowing', 'rower'];

/**
 * Analyze weight trends over the last 7 days
 * @param weights - Array of weight entries
 * @param goal - User's fitness goal
 * @returns Status and delta
 */
export function analyzeWeights(
  weights: WeightEntry[],
  goal: Goal
): { status: 'insufficient' | 'onTrack' | 'stagnant' | 'gainTooFast' | 'lossTooFast'; delta: number } {
  // Filter to last 7 days and sort by date ascending (oldest first)
  const today = new Date();
  const sorted = weights
    .filter(w => {
      const entryDate = new Date(w.date);
      const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7;
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // Ascending order

  if (sorted.length < 2) {
    return { status: 'insufficient', delta: 0 };
  }

  const first = sorted[0]; // Oldest
  const last = sorted[sorted.length - 1]; // Newest
  const delta = last.kg - first.kg;

  // If change is very small, consider stagnant
  if (Math.abs(delta) <= 0.1) {
    return { status: 'stagnant', delta };
  }

  if (goal === 'Maintenance') {
    if (delta > 0.3) {
      return { status: 'gainTooFast', delta };
    } else if (delta < -0.3) {
      return { status: 'lossTooFast', delta };
    } else {
      return { status: 'onTrack', delta };
    }
  } else if (goal === 'Fat Loss') {
    return delta >= -0.1 ? { status: 'stagnant', delta } : { status: 'onTrack', delta };
  } else {
    // Muscle Gain or Strength & Conditioning
    return delta <= 0.1 ? { status: 'stagnant', delta } : { status: 'onTrack', delta };
  }
}

/**
 * Propose adjustments based on status, goal, escalation level, and drift
 * @param status - Current weight status
 * @param goal - User's fitness goal
 * @param level - Escalation level (0, 1, or 2)
 * @param drift - For Maintenance: 'up' if gaining, 'down' if losing
 * @returns Proposed adjustments
 */
export function proposeAdjustments(
  status: string,
  goal: Goal,
  level: EscalationLevel,
  drift?: 'up' | 'down'
): AdjustmentProposal {
  // Default no change
  const defaultProposal: AdjustmentProposal = {
    caloriesDelta: 0,
    cardioMinutesDelta: 0,
    stepsDelta: 0,
    macroShift: 'none',
  };

  // If on track, no adjustments needed
  if (status === 'onTrack') {
    return defaultProposal;
  }

  // If status is insufficient, no adjustments
  if (status === 'insufficient') {
    return defaultProposal;
  }

  // Handle stagnant status
  if (status === 'stagnant') {
    // Level 0: First time stagnant
    if (level === 0) {
      if (goal === 'Fat Loss') {
        return {
          caloriesDelta: 0,
          cardioMinutesDelta: 5,
          stepsDelta: 0,
          macroShift: 'none',
        };
      } else if (goal === 'Muscle Gain' || goal === 'Strength & Conditioning') {
        return {
          caloriesDelta: 0,
          cardioMinutesDelta: -5,
          stepsDelta: 0,
          macroShift: 'none',
        };
      } else {
        // Maintenance - no change unless drift
        return defaultProposal;
      }
    }

    // Level 1: Still stagnant after 4 days
    if (level === 1) {
      if (goal === 'Fat Loss') {
        return {
          caloriesDelta: -100,
          cardioMinutesDelta: 0,
          stepsDelta: 0,
          macroShift: 'carbs',
        };
      } else if (goal === 'Muscle Gain' || goal === 'Strength & Conditioning') {
        return {
          caloriesDelta: 100,
          cardioMinutesDelta: 0,
          stepsDelta: 0,
          macroShift: 'none',
        };
      } else {
        // Maintenance - use drift logic
        if (drift === 'up') {
          // Use Muscle/Strength logic
          return {
            caloriesDelta: 100,
            cardioMinutesDelta: 0,
            stepsDelta: 0,
            macroShift: 'none',
          };
        } else if (drift === 'down') {
          // Use Fat Loss logic
          return {
            caloriesDelta: -100,
            cardioMinutesDelta: 0,
            stepsDelta: 0,
            macroShift: 'carbs',
          };
        } else {
          return defaultProposal;
        }
      }
    }

    // Level 2: Still stagnant after another 4 days
    if (level === 2) {
      if (goal === 'Maintenance') {
        return defaultProposal;
      } else {
        // All non-maintenance goals
        return {
          caloriesDelta: 0,
          cardioMinutesDelta: 0,
          stepsDelta: -700,
          macroShift: 'none',
        };
      }
    }
  }

  return defaultProposal;
}

/**
 * Apply adjustments to current targets and check-in settings
 * @param current - Current targets and checkin plan
 * @param proposal - Proposed adjustments
 * @param goal - User's fitness goal
 * @returns Updated targets and check-in settings
 */
export function applyAdjustments(
  current: { targets: Targets; checkin: CheckinPlan },
  proposal: AdjustmentProposal,
  goal: Goal
): { newTargets: Targets; newCheckin: CheckinPlan } {
  const newTargets = { ...current.targets };
  const newCheckin = { ...current.checkin };

  // Apply calories delta
  if (proposal.caloriesDelta !== 0) {
    newTargets.calories = Math.round(newTargets.calories + proposal.caloriesDelta);

    if (proposal.macroShift === 'carbs') {
      // For Fat Loss with negative caloriesDelta, adjust carbs only
      const carbsDeltaG = Math.round(proposal.caloriesDelta / 4);
      newTargets.carbsG = Math.max(0, newTargets.carbsG + carbsDeltaG);
    } else {
      // For positive deltas (gain/strength), increase carbsG
      const carbsDeltaG = Math.round(proposal.caloriesDelta / 4);
      newTargets.carbsG = Math.max(0, newTargets.carbsG + carbsDeltaG);
    }
  }

  // Apply cardio minutes delta
  newCheckin.lissMinPerSession = Math.max(0, newCheckin.lissMinPerSession + proposal.cardioMinutesDelta);

  // Apply steps delta
  newCheckin.stepTarget = Math.max(0, newCheckin.stepTarget + proposal.stepsDelta);

  return {
    newTargets,
    newCheckin,
  };
}

/**
 * Calculate rest day calories based on goal
 * @param targets - Current nutrition targets
 * @param goal - User's fitness goal
 * @returns Rest day calories (or regular calories for non-Fat Loss goals)
 */
export function restDayCalories(targets: Targets, goal: Goal): number {
  if (goal === 'Fat Loss') {
    return targets.calories - 200;
  }
  return targets.calories;
}

export function isLISSSession(summary: { type?: string; cardioSummary?: any; cardioIntervals?: any[] } | null | undefined): boolean {
  if (!summary || summary.type !== 'cardio') {
    return false;
  }

  const cardioSummary = summary.cardioSummary ?? {};
  if (cardioSummary.targetLISS === true) {
    return true;
  }

  const intervals: any[] = Array.isArray(summary.cardioIntervals) ? summary.cardioIntervals : [];
  if (!intervals.length) {
    return false;
  }

  const mode = String(cardioSummary.mode ?? '').toLowerCase();
  const steadyOnly = intervals.length === 1 && String(intervals[0]?.type).toLowerCase() === 'steady';
  if (steadyOnly && CARDIO_STEADY_MODES.includes(mode)) {
    return true;
  }

  const hasLissLabel = intervals.some((interval) =>
    typeof interval?.label === 'string' && interval.label.toLowerCase().includes('liss')
  );
  if (hasLissLabel) {
    return true;
  }

  return false;
}

export function lissMinutesFromSession(summary: { type?: string; cardioSummary?: any; cardioIntervals?: any[] } | null | undefined): number {
  if (!isLISSSession(summary)) {
    return 0;
  }
  const totalSec = Number(summary?.cardioSummary?.totalTimeSec ?? 0);
  if (!Number.isFinite(totalSec) || totalSec <= 0) {
    return 0;
  }
  return minutesFromSeconds(totalSec);
}

export async function bumpWeeklyAdherence(
  db: Firestore,
  uid: string,
  dateISO: string,
  addMinutes: number,
  countAsSession: boolean
): Promise<void> {
  const weekStartISO = startOfWeekISO(dateISO);
  const adherenceRef = doc(db, 'users', uid, 'adherence', weekStartISO);
  const adherenceSnap = await getDoc(adherenceRef);
  const current: Adherence = adherenceSnap.exists()
    ? ({
        lissMinutes: Number(adherenceSnap.data()?.lissMinutes ?? 0),
        lissSessions: Number(adherenceSnap.data()?.lissSessions ?? 0),
        sessionsTotal: Number(adherenceSnap.data()?.sessionsTotal ?? 0),
      })
    : { lissMinutes: 0, lissSessions: 0, sessionsTotal: 0 };

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data() as any;
  const lissMinPerSession = Number(userData?.checkin?.lissMinPerSession ?? 20);

  const next: Adherence = {
    lissMinutes: Math.max(0, current.lissMinutes + Math.max(0, addMinutes)),
    lissSessions: current.lissSessions,
    sessionsTotal: (current.sessionsTotal ?? 0) + 1,
  };

  if (countAsSession && addMinutes >= lissMinPerSession) {
    next.lissSessions += 1;
  }

  await setDoc(
    adherenceRef,
    {
      ...next,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
