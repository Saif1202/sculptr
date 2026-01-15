import { z } from 'zod';

export const signupSchema = z.object({
  title: z.enum(['Mr', 'Mrs', 'Miss', 'Ms', 'Mx']).optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  sex: z.enum(['Male', 'Female']),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one capital letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirm: z.string(),
  dob: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, 'Date must be in DD-MM-YYYY format'),
  heightCm: z.number().positive('Height must be a positive number'),
  weightKg: z.number().positive('Weight must be a positive number'),
  goal: z.enum(['Fat Loss', 'Strength & Conditioning', 'Muscle Gain', 'Maintenance']),
  goalWeightKg: z.number().positive('Goal weight must be a positive number').optional(),
  activity: z.enum(['None', '1-3/wk', '4-5/wk', '6-7/wk or manual']),
}).refine((data) => data.password === data.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
});

export type SignupFormData = z.infer<typeof signupSchema>;

/**
 * Calculate age from DD-MM-YYYY date string
 * @param dateStr - Date string in DD-MM-YYYY format (e.g., "15-01-1997")
 * @returns Age in years
 */
export function calcAge(dateStr: string): number {
  // Parse DD-MM-YYYY format
  const [day, month, year] = dateStr.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day); // month is 0-indexed
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

