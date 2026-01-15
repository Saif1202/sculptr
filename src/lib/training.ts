import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  limit as fsLimit,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

export const MUSCLES = [
  'Chest',
  'Back',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Calves',
  'Core',
  'Cardio',
] as const;

export const EQUIPMENT = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bodyweight',
  'Kettlebell',
  'Band',
  'Other',
] as const;

export type MuscleGroup = typeof MUSCLES[number];
export type EquipmentType = typeof EQUIPMENT[number];
export type MovementType = 'Compound' | 'Isolation' | 'Cardio';

export interface ExerciseSeed {
  name: string;
  muscles: MuscleGroup[];
  equipment: EquipmentType;
  movement: MovementType;
  instructions?: string;
  cues?: string[];
  unit: 'kg' | 'lb';
  isBodyweight?: boolean;
  demoUrl?: string;
  popularity?: number;
}

export function estimate1RM(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30));
}

export function setVolume(weight: number | null, reps: number | null): number {
  return (weight ?? 0) * (reps ?? 0);
}

export type ExerciseSource = 'seed' | 'user';

export const CARDIO_MODES = ['Run', 'Treadmill', 'Stairmaster', 'Bike', 'Row', 'Other'] as const;
export type CardioMode = typeof CARDIO_MODES[number];

export interface ExerciseRecord extends ExerciseSeed {
  source?: ExerciseSource;
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  unit: 'kg' | 'lb';
  targetSets: number;
  repTarget?: string;
  restSec?: number;
  rpeTarget?: number;
  notes?: string;
}

export type WorkoutType = 'strength' | 'cardio';

export interface CardioInterval {
  type: 'steady' | 'interval';
  label?: string;
  durationSec: number;
  targetHR?: { min: number; max: number } | null;
  targetPace?: string | null;
  targetSpeedKmh?: number | null;
  targetInclinePct?: number | null;
  targetLevel?: number | null;
}

export interface CardioPlan {
  mode: CardioMode;
  intervals: CardioInterval[];
  cooldownSec?: number | null;
}

export interface LoggedSet {
  exerciseId: string;
  name: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  restSec?: number | null;
  doneAt: number;
}

export interface SessionSummary {
  volume: number;
  bestEst1RM: Record<string, number>;
}

export function calcSessionSummary(sets: LoggedSet[]): SessionSummary {
  const perExerciseBest: Record<string, number> = {};
  let totalVolume = 0;

  sets.forEach((set) => {
    const volume = setVolume(set.weight, set.reps);
    totalVolume += volume;

    const est = estimate1RM(set.weight ?? 0, set.reps ?? 0);
    if (!perExerciseBest[set.exerciseId] || est > perExerciseBest[set.exerciseId]) {
      perExerciseBest[set.exerciseId] = est;
    }
  });

  return {
    volume: Math.round(totalVolume),
    bestEst1RM: perExerciseBest,
  };
}

export function maxHR(age: number): number {
  return Math.max(120, 220 - age);
}

export function zoneRange(age: number, zone: 2 | 3 | 4): { min: number; max: number } {
  const m = maxHR(age);
  const ranges: Record<2 | 3 | 4, [number, number]> = {
    2: [0.6, 0.7],
    3: [0.7, 0.8],
    4: [0.8, 0.9],
  };
  const [lo, hi] = ranges[zone];
  return {
    min: Math.round(m * lo),
    max: Math.round(m * hi),
  };
}

export function lissTargetHR(age: number): { min: number; max: number } {
  const z2 = zoneRange(age, 2);
  const anchor = 140;
  return {
    min: Math.min(Math.max(z2.min, anchor), z2.max),
    max: Math.max(Math.min(z2.max, anchor), z2.min),
  };
}

const DEFAULT_STAIRMASTER_LEVEL = 5;
const DEFAULT_TREADMILL_INCLINE = 1;

export function sprintTemplate(): CardioPlan {
  const intervals: CardioInterval[] = [];

  for (let i = 1; i <= 3; i += 1) {
    intervals.push({
      type: 'interval',
      label: `2 min @ 13 km/h (${i}/3)`,
      durationSec: 120,
      targetSpeedKmh: 13,
    });
    intervals.push({
      type: 'steady',
      label: `Rest ${i}/3`,
      durationSec: 60,
    });
  }

  intervals.push({
    type: 'steady',
    label: 'Transition Rest',
    durationSec: 30,
  });

  for (let i = 1; i <= 4; i += 1) {
    intervals.push({
      type: 'interval',
      label: `1 min @ 14 km/h (${i}/4)`,
      durationSec: 60,
      targetSpeedKmh: 14,
    });
    intervals.push({
      type: 'steady',
      label: `Rest ${i}/4`,
      durationSec: 30,
    });
  }

  for (let i = 1; i <= 4; i += 1) {
    intervals.push({
      type: 'interval',
      label: `30s @ 15 km/h (${i}/4)`,
      durationSec: 30,
      targetSpeedKmh: 15,
    });
    intervals.push({
      type: 'steady',
      label: `Rest ${i}/4`,
      durationSec: 15,
    });
  }

  return {
    mode: 'Treadmill',
    intervals,
    cooldownSec: 180,
  };
}

export function zoneTemplate(
  goal: 'Z2' | 'Z3-4',
  age: number,
  mode: CardioMode
): CardioPlan {
  const intervals: CardioInterval[] = [];
  if (goal === 'Z2') {
    const hr = zoneRange(age, 2);
    intervals.push({
      type: 'steady',
      label: 'Zone 2 Steady',
      durationSec: 40 * 60,
      targetHR: hr,
      targetInclinePct: mode === 'Treadmill' ? DEFAULT_TREADMILL_INCLINE : null,
      targetLevel: mode === 'Stairmaster' ? DEFAULT_STAIRMASTER_LEVEL : null,
    });
    return {
      mode,
      intervals,
      cooldownSec: 180,
    };
  }

  const zone3 = zoneRange(age, 3);
  const zone4 = zoneRange(age, 4);
  intervals.push({
    type: 'steady',
    label: 'Zone 3-4 Effort',
    durationSec: 25 * 60,
    targetHR: {
      min: zone3.min,
      max: zone4.max,
    },
    targetInclinePct: mode === 'Treadmill' ? DEFAULT_TREADMILL_INCLINE : null,
    targetLevel: mode === 'Stairmaster' ? DEFAULT_STAIRMASTER_LEVEL + 1 : null,
  });

  return {
    mode,
    intervals,
    cooldownSec: 180,
  };
}

export function lissTemplate(age: number, mode: CardioMode = 'Stairmaster'): CardioPlan {
  const hr = lissTargetHR(age);
  return {
    mode,
    intervals: [
      {
        type: 'steady',
        label: 'LISS @140',
        durationSec: 20 * 60,
        targetHR: hr,
        targetInclinePct: mode === 'Treadmill' ? 12 : null,
        targetLevel: mode === 'Stairmaster' ? DEFAULT_STAIRMASTER_LEVEL : null,
        targetSpeedKmh: mode === 'Treadmill' ? 4.5 : null,
      },
    ],
    cooldownSec: 180,
  };
}

export function sumDurationSec(plan: CardioPlan): number {
  const base = plan.intervals.reduce((acc, interval) => acc + (interval.durationSec || 0), 0);
  return base + (plan.cooldownSec ?? 0);
}

export const STARTER_EXERCISES: ExerciseSeed[] = [
  {
    name: 'Barbell Back Squat',
    muscles: ['Quads', 'Glutes', 'Hamstrings'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions:
      'Set the bar on your upper traps, brace your core, and sit back and down until hips are below parallel. Drive through your mid-foot to stand.',
    cues: ['Chest up', 'Knees track over toes', 'Brace hard'],
    unit: 'kg',
    popularity: 100,
  },
  {
    name: 'Barbell Bench Press',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions:
      'Lie on the bench with feet planted. Lower the bar to mid-chest with control, then press back up while keeping your shoulder blades packed.',
    cues: ['Wrists stacked', 'Touch chest lightly', 'Drive through floor'],
    unit: 'kg',
    popularity: 100,
  },
  {
    name: 'Conventional Deadlift',
    muscles: ['Back', 'Hamstrings', 'Glutes'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions:
      'Set your hips, grip the bar just outside knees, brace, and stand tall while keeping the bar close. Hinge back down with control.',
    cues: ['Brace belly', 'Push floor away', 'Hips and shoulders rise together'],
    unit: 'kg',
    popularity: 95,
  },
  {
    name: 'Overhead Press',
    muscles: ['Shoulders', 'Triceps'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions:
      'Press the bar overhead from collarbone height, locking out without shrugging. Keep glutes and abs tight.',
    cues: ['Brace core', 'Head through at top', 'Squeeze glutes'],
    unit: 'kg',
    popularity: 80,
  },
  {
    name: 'Bent-Over Barbell Row',
    muscles: ['Back', 'Biceps'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions:
      'Hinge to a flat back, row the bar to the lower ribs while squeezing shoulder blades together.',
    cues: ['Pull to hips', 'Keep torso still'],
    unit: 'kg',
    popularity: 85,
  },
  {
    name: 'Lat Pulldown',
    muscles: ['Back', 'Biceps'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions:
      'Grip overhead bar wider than shoulders, pull towards upper chest while keeping torso tall.',
    cues: ['Drive elbows down', 'Don’t lean back far'],
    unit: 'kg',
    popularity: 75,
  },
  {
    name: 'Leg Press',
    muscles: ['Quads', 'Glutes'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions: 'Press the sled away while keeping hips down. Control the descent to at least 90° knee bend.',
    unit: 'kg',
    popularity: 70,
  },
  {
    name: 'Walking Lunge',
    muscles: ['Glutes', 'Quads', 'Hamstrings'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Step forward, drop back knee towards the floor, drive through front foot to stand and step into the next rep.',
    unit: 'kg',
    popularity: 65,
  },
  {
    name: 'Dumbbell Biceps Curl',
    muscles: ['Biceps'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Curl dumbbells while keeping upper arm fixed. Lower under control.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Cable Triceps Pushdown',
    muscles: ['Triceps'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Grip the rope, keep elbows pinned, extend the elbow fully then return under control.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Plank',
    muscles: ['Core'],
    equipment: 'Bodyweight',
    movement: 'Isolation',
    instructions: 'Hold a rigid plank on elbows with glutes and abs squeezed, no sagging hips.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 55,
  },
  {
    name: 'Treadmill Run',
    muscles: ['Cardio'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Run at a sustainable pace; maintain upright posture and relaxed arms.',
    unit: 'kg',
    popularity: 50,
  },
  {
    name: 'Stairmaster',
    muscles: ['Cardio', 'Glutes', 'Quads'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Climb with steady steps, keep chest tall and avoid leaning heavily on the rails.',
    unit: 'kg',
    popularity: 45,
  },
  {
    name: 'Seated Cable Row',
    muscles: ['Back', 'Biceps'],
    equipment: 'Cable',
    movement: 'Compound',
    instructions: 'Sit tall, pull handle to torso while squeezing shoulder blades together.',
    unit: 'kg',
    popularity: 70,
  },
  {
    name: 'Hip Thrust',
    muscles: ['Glutes', 'Hamstrings'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions: 'Drive hips up until knees and hips form a straight line. Squeeze glutes at top.',
    unit: 'kg',
    popularity: 80,
  },
  {
    name: 'Romanian Deadlift',
    muscles: ['Hamstrings', 'Glutes'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions: 'Hinge at the hips, keep slight knee bend, lower the bar down the legs, then drive hips forward to stand tall.',
    unit: 'kg',
    popularity: 82,
  },
  {
    name: 'Front Squat',
    muscles: ['Quads', 'Glutes', 'Core'],
    equipment: 'Barbell',
    movement: 'Compound',
    instructions: 'Rack the bar on front delts, keep torso tall, sit straight down and drive back up.',
    unit: 'kg',
    popularity: 78,
  },
  {
    name: 'Bulgarian Split Squat',
    muscles: ['Glutes', 'Quads'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Rear foot elevated, lower back knee towards floor, drive through front heel to stand.',
    unit: 'kg',
    popularity: 76,
  },
  {
    name: 'Leg Extension',
    muscles: ['Quads'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Sit upright, extend knees to lift pad, squeeze quads at top, lower under control.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Leg Curl',
    muscles: ['Hamstrings'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Flex the knees to curl the pad toward glutes, keep hips pressed into bench.',
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Standing Calf Raise',
    muscles: ['Calves'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Rise onto toes with a pause at the top, lower heels below platform.',
    unit: 'kg',
    popularity: 55,
  },
  {
    name: 'Seated Calf Raise',
    muscles: ['Calves'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Keep knees bent, press through balls of feet to raise the weight, pause and lower slowly.',
    unit: 'kg',
    popularity: 50,
  },
  {
    name: 'Pull-Up',
    muscles: ['Back', 'Biceps'],
    equipment: 'Bodyweight',
    movement: 'Compound',
    instructions: 'Grip bar overhand, pull chin over bar while keeping chest proud, lower under control.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 90,
  },
  {
    name: 'Chin-Up',
    muscles: ['Back', 'Biceps'],
    equipment: 'Bodyweight',
    movement: 'Compound',
    instructions: 'Underhand grip, pull until chin clears bar, lower with control.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 85,
  },
  {
    name: 'Incline Dumbbell Press',
    muscles: ['Chest', 'Shoulders', 'Triceps'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Bench at 30°, lower dumbbells to upper chest, press back up together.',
    unit: 'kg',
    popularity: 82,
  },
  {
    name: 'Dumbbell Fly',
    muscles: ['Chest'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'With slight elbow bend, arc arms wide then squeeze chest to bring bells together.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Cable Chest Fly',
    muscles: ['Chest'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Step forward, bring handles together in front of chest, pause and return slowly.',
    unit: 'kg',
    popularity: 62,
  },
  {
    name: 'Push-Up',
    muscles: ['Chest', 'Shoulders', 'Triceps', 'Core'],
    equipment: 'Bodyweight',
    movement: 'Compound',
    instructions: 'Body in plank, lower chest to floor, press back up keeping core tight.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 88,
  },
  {
    name: 'Dips',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    equipment: 'Bodyweight',
    movement: 'Compound',
    instructions: 'Lower body between bars until shoulders below elbows, press back up without swinging.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 80,
  },
  {
    name: 'Arnold Press',
    muscles: ['Shoulders'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Start palms facing you, rotate wrists while pressing overhead, reverse on the way down.',
    unit: 'kg',
    popularity: 70,
  },
  {
    name: 'Lateral Raise',
    muscles: ['Shoulders'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Raise bells to shoulder height with slight elbow bend, control descent.',
    unit: 'kg',
    popularity: 68,
  },
  {
    name: 'Face Pull',
    muscles: ['Shoulders', 'Back'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Pull rope towards face with elbows high, squeeze rear delts.',
    unit: 'kg',
    popularity: 66,
  },
  {
    name: 'Rear Delt Fly',
    muscles: ['Shoulders', 'Back'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Hinge forward, raise dumbbells out to the side to shoulder height.',
    unit: 'kg',
    popularity: 64,
  },
  {
    name: 'Hammer Curl',
    muscles: ['Biceps'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Neutral grip, curl dumbbells keeping elbows close to sides.',
    unit: 'kg',
    popularity: 63,
  },
  {
    name: 'Preacher Curl',
    muscles: ['Biceps'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Arms on pad, curl bar toward shoulders, lower slow for tension.',
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Skull Crusher',
    muscles: ['Triceps'],
    equipment: 'Barbell',
    movement: 'Isolation',
    instructions: 'Lying on bench, lower bar to forehead, extend elbows without moving upper arm.',
    unit: 'kg',
    popularity: 65,
  },
  {
    name: 'Overhead Triceps Extension',
    muscles: ['Triceps'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Raise dumbbell overhead with both hands, bend elbows to lower, extend to lockout.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Cable Crunch',
    muscles: ['Core'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Kneel facing cable, crunch torso down while keeping hips fixed.',
    unit: 'kg',
    popularity: 55,
  },
  {
    name: 'Hanging Leg Raise',
    muscles: ['Core'],
    equipment: 'Bodyweight',
    movement: 'Isolation',
    instructions: 'Hang from bar, lift legs up to hip height without swinging.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Russian Twist',
    muscles: ['Core'],
    equipment: 'Other',
    movement: 'Isolation',
    instructions: 'Seated with feet elevated, rotate torso tapping weight side to side.',
    unit: 'kg',
    popularity: 52,
  },
  {
    name: 'Farmer Carry',
    muscles: ['Core', 'Glutes'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Hold heavy implements at sides, walk tall keeping core braced.',
    unit: 'kg',
    popularity: 57,
  },
  {
    name: 'Kettlebell Swing',
    muscles: ['Glutes', 'Hamstrings', 'Core'],
    equipment: 'Kettlebell',
    movement: 'Compound',
    instructions: 'Hinge and snap hips to swing bell to chest height, let it fall and repeat.',
    unit: 'kg',
    popularity: 75,
  },
  {
    name: 'Goblet Squat',
    muscles: ['Quads', 'Glutes', 'Core'],
    equipment: 'Kettlebell',
    movement: 'Compound',
    instructions: 'Hold bell at chest, sit between heels keeping torso upright.',
    unit: 'kg',
    popularity: 72,
  },
  {
    name: 'Single-Leg Romanian Deadlift',
    muscles: ['Hamstrings', 'Glutes', 'Core'],
    equipment: 'Dumbbell',
    movement: 'Isolation',
    instructions: 'Balance on one leg, hinge forward keeping hips square, return by squeezing glutes.',
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Cable Lateral Raise',
    muscles: ['Shoulders'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Stand side-on to cable, raise handle to shoulder height, control back down.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'Machine Shoulder Press',
    muscles: ['Shoulders', 'Triceps'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions: 'Press handles overhead without locking elbows violently, lower with control.',
    unit: 'kg',
    popularity: 68,
  },
  {
    name: 'Smith Machine Squat',
    muscles: ['Quads', 'Glutes'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions: 'Feet slightly forward, squat down keeping back against the bar path.',
    unit: 'kg',
    popularity: 63,
  },
  {
    name: 'Lat Prayer Pulldown',
    muscles: ['Back'],
    equipment: 'Cable',
    movement: 'Isolation',
    instructions: 'Kneel in front of cable, sweep straight arms down to thighs focusing on lats.',
    unit: 'kg',
    popularity: 54,
  },
  {
    name: 'Machine Row',
    muscles: ['Back', 'Biceps'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions: 'Sit chest against pad, row handles back while squeezing scapulae.',
    unit: 'kg',
    popularity: 70,
  },
  {
    name: 'Air Bike Sprint',
    muscles: ['Cardio'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Alternate arms and legs powerfully for intervals, maintain upright posture.',
    unit: 'kg',
    popularity: 48,
  },
  {
    name: 'Rowing Machine',
    muscles: ['Cardio', 'Back', 'Hamstrings'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Push through legs then pull handle to chest, recover by extending arms first.',
    unit: 'kg',
    popularity: 50,
  },
  {
    name: 'Battle Rope Wave',
    muscles: ['Cardio', 'Shoulders', 'Core'],
    equipment: 'Other',
    movement: 'Cardio',
    instructions: 'Alternate arms to create waves, keep knees bent and core tight.',
    unit: 'kg',
    popularity: 45,
  },
  {
    name: 'Treadmill Incline Walk',
    muscles: ['Cardio', 'Glutes', 'Hamstrings'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Walk briskly on incline keeping hands off rails, focus on even steps.',
    unit: 'kg',
    popularity: 52,
  },
  {
    name: 'Assault Bike Recovery',
    muscles: ['Cardio'],
    equipment: 'Machine',
    movement: 'Cardio',
    instructions: 'Maintain steady cadence with low resistance for active recovery.',
    unit: 'kg',
    popularity: 40,
  },
  {
    name: 'Glute Bridge',
    muscles: ['Glutes', 'Hamstrings'],
    equipment: 'Bodyweight',
    movement: 'Isolation',
    instructions: 'Lie on back, drive hips up, pause and squeeze glutes at the top.',
    isBodyweight: true,
    unit: 'kg',
    popularity: 70,
  },
  {
    name: 'Hip Abduction Machine',
    muscles: ['Glutes'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Sit upright, push pads apart with knees, control return.',
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Hip Adduction Machine',
    muscles: ['Glutes'],
    equipment: 'Machine',
    movement: 'Isolation',
    instructions: 'Squeeze pads together focusing on inner thighs, avoid bouncing.',
    unit: 'kg',
    popularity: 52,
  },
  {
    name: 'Smith Machine Bench Press',
    muscles: ['Chest', 'Triceps'],
    equipment: 'Machine',
    movement: 'Compound',
    instructions: 'Grip slightly wider than shoulder width, lower to chest, press back up.',
    unit: 'kg',
    popularity: 65,
  },
  {
    name: 'Box Jump',
    muscles: ['Glutes', 'Quads', 'Hamstrings'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Explosively jump onto box, land softly, step down with control.',
    unit: 'kg',
    popularity: 55,
  },
  {
    name: 'Medicine Ball Slam',
    muscles: ['Core', 'Shoulders'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Raise ball overhead, slam to floor using whole body, catch on rebound.',
    unit: 'kg',
    popularity: 50,
  },
  {
    name: 'Resistance Band Pull Apart',
    muscles: ['Shoulders', 'Back'],
    equipment: 'Band',
    movement: 'Isolation',
    instructions: 'Hold band at chest height, pull apart squeezing shoulder blades.',
    unit: 'kg',
    popularity: 48,
  },
  {
    name: 'Band Face Pull',
    muscles: ['Shoulders', 'Back'],
    equipment: 'Band',
    movement: 'Isolation',
    instructions: 'Anchor band at head height, pull toward forehead keeping elbows high.',
    unit: 'kg',
    popularity: 47,
  },
  {
    name: 'TRX Row',
    muscles: ['Back', 'Biceps', 'Core'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Body in straight line, pull chest to handles, lower under control.',
    unit: 'kg',
    popularity: 60,
  },
  {
    name: 'TRX Chest Press',
    muscles: ['Chest', 'Shoulders', 'Triceps'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Lean into straps, lower chest between handles, press back to start.',
    unit: 'kg',
    popularity: 55,
  },
  {
    name: 'Single-Arm Dumbbell Row',
    muscles: ['Back', 'Biceps'],
    equipment: 'Dumbbell',
    movement: 'Compound',
    instructions: 'Brace hand on bench, row dumbbell towards hip, squeeze at top.',
    unit: 'kg',
    popularity: 72,
  },
  {
    name: 'Cable Wood Chop',
    muscles: ['Core'],
    equipment: 'Cable',
    movement: 'Compound',
    instructions: 'Rotate torso diagonally pulling handle across body, control return.',
    unit: 'kg',
    popularity: 53,
  },
  {
    name: 'Swiss Ball Crunch',
    muscles: ['Core'],
    equipment: 'Other',
    movement: 'Isolation',
    instructions: 'Lay back on ball, curl ribs towards hips, lower with control.',
    unit: 'kg',
    popularity: 50,
  },
  {
    name: 'Sled Push',
    muscles: ['Glutes', 'Quads', 'Core'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Drive sled forward with powerful steps, maintain neutral spine.',
    unit: 'kg',
    popularity: 58,
  },
  {
    name: 'Sled Drag',
    muscles: ['Glutes', 'Hamstrings'],
    equipment: 'Other',
    movement: 'Compound',
    instructions: 'Attach harness, walk backward pulling sled steadily.',
    unit: 'kg',
    popularity: 54,
  },
];

const MIN_SEEDED = 8;

export async function seedGlobalExercises(db: Firestore): Promise<void> {
  try {
    const exercisesRef = collection(db, 'exercises');
    const existingSnap = await getDocs(query(exercisesRef, fsLimit(MIN_SEEDED)));
    if (existingSnap.size >= MIN_SEEDED) {
      return; // already have a reasonable starter set
    }

    const namesSnap = await getDocs(exercisesRef);
    const existingNames = new Set<string>();
    namesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.name) {
        existingNames.add(String(data.name).toLowerCase());
      }
    });

    for (const seed of STARTER_EXERCISES) {
      if (existingNames.has(seed.name.toLowerCase())) {
        continue;
      }

      await addDoc(exercisesRef, {
        ...seed,
        source: 'seed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn('seedGlobalExercises failed:', error);
  }
}

export async function createUserExercise(
  db: Firestore,
  uid: string,
  exercise: ExerciseRecord
): Promise<void> {
  const trimmedName = exercise.name.trim();
  if (!trimmedName) {
    throw new Error('Exercise name is required');
  }

  const payload: ExerciseRecord = {
    ...exercise,
    name: trimmedName,
    source: 'user',
  };

  const userExercisesRef = collection(db, 'users', uid, 'exercises');
  await addDoc(userExercisesRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    const globalRef = collection(db, 'exercises');
    const existing = await getDocs(query(globalRef, where('name', '==', trimmedName), fsLimit(1)));
    if (existing.empty) {
      await addDoc(globalRef, {
        ...payload,
        popularity: payload.popularity ?? 10,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn('createUserExercise global clone failed:', error);
  }
}

