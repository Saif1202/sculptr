import { Platform } from 'react-native';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// RevenueCat Public SDK Keys – replace with your keys from RevenueCat dashboard (Project → API Keys)
const RC_IOS_KEY = 'test_BxTatzNMmyPOwGcAKwYEbNYjoXM';
const RC_ANDROID_KEY = 'test_BxTatzNMmyPOwGcAKwYEbNYjoXM';

let purchasesConfigured = false;

/**
 * Initialize RevenueCat Purchases SDK (call once per app launch after user is known).
 * Safe to call on web – no-ops when platform is not ios/android.
 * @param userId - Firebase user ID
 */
export async function initPurchases(userId: string): Promise<void> {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') {
    return;
  }
  try {
    const apiKey = platform === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
    if (!purchasesConfigured) {
      await Purchases.configure({ apiKey });
      purchasesConfigured = true;
    }
    await Purchases.logIn(userId);
  } catch (error) {
    console.error('Error initializing RevenueCat:', error);
    throw error;
  }
}

/**
 * Get current customer info from RevenueCat
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('Error getting customer info:', error);
    throw error;
  }
}

/**
 * Get available offerings from RevenueCat
 */
export async function getOfferings(): Promise<any> {
  try {
    return await Purchases.getOfferings();
  } catch (error) {
    console.error('Error getting offerings:', error);
    throw error;
  }
}

/**
 * Purchase monthly subscription
 */
export async function purchaseMonthly(): Promise<CustomerInfo> {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (!offerings.current || !offerings.current.availablePackages.length) {
      throw new Error('No packages available for purchase');
    }
    
    // Find monthly package (usually the default or first available)
    const monthlyPackage = offerings.current.availablePackages.find(
      (pkg: any) => pkg.identifier === 'monthly' || pkg.packageType === 'MONTHLY'
    ) || offerings.current.availablePackages[0];
    
    if (!monthlyPackage) {
      throw new Error('Monthly package not found');
    }
    
    const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);
    
    // Update Firestore tier based on purchase
    await updateTierInFirestore(customerInfo);
    
    return customerInfo;
  } catch (error: any) {
    console.error('Error purchasing monthly subscription:', error);
    
    // Handle user cancellation gracefully
    if (error.userCancelled) {
      throw new Error('Purchase was cancelled');
    }
    
    throw error;
  }
}

/**
 * Restore previous purchases
 */
export async function restore(): Promise<CustomerInfo> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    
    // Update Firestore tier based on restored purchases
    await updateTierInFirestore(customerInfo);
    
    return customerInfo;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
}

/**
 * Check if user has premium entitlement
 * @param customerInfo - CustomerInfo from RevenueCat
 * @returns true if premium entitlement is active
 */
export function isPremium(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return customerInfo.entitlements.active['premium'] !== undefined;
}

/**
 * Update user tier in Firestore based on RevenueCat entitlement
 */
async function updateTierInFirestore(customerInfo: CustomerInfo): Promise<void> {
  try {
    const userId = customerInfo.originalAppUserId;
    if (!userId) {
      console.warn('No user ID in customer info');
      return;
    }
    
    const tier = isPremium(customerInfo) ? 'premium' : 'free';
    
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      profile: {
        tier,
      },
    }, { merge: true });
    
    console.log('Updated user tier to:', tier);
  } catch (error) {
    console.error('Error updating tier in Firestore:', error);
    // Don't throw - this is a background update
  }
}

/**
 * Sync tier from RevenueCat to Firestore
 * Call this after initPurchases to ensure Firestore is up to date
 */
export async function syncTierToFirestore(userId: string): Promise<void> {
  try {
    const customerInfo = await getCustomerInfo();
    await updateTierInFirestore(customerInfo);
  } catch (error) {
    console.error('Error syncing tier to Firestore:', error);
  }
}

