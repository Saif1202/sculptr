import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme';
import { getOfferings, purchaseMonthly, restore, isPremium } from '../src/lib/billing';

export default function PaywallScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [monthlyPackage, setMonthlyPackage] = useState<any>(null);
  const [price, setPrice] = useState<string>('£5.99');

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      const offerings = await getOfferings();
      
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        // Find monthly package
        const monthly = offerings.current.availablePackages.find(
          (pkg: any) => pkg.identifier === 'monthly' || pkg.packageType === 'MONTHLY'
        ) || offerings.current.availablePackages[0];
        
        setMonthlyPackage(monthly);
        // Get price from RevenueCat, but ensure it's in GBP format
        const priceString = monthly.product.priceString || '£5.99';
        // If price contains $79.99 or similar wrong price, use fallback
        // This is a temporary fix - the real fix is updating the store subscription price
        if (priceString.includes('79.99') || priceString.includes('$79')) {
          console.warn('Incorrect price detected from store:', priceString);
          setPrice('£5.99');
        } else {
          setPrice(priceString);
        }
      }
    } catch (error: any) {
      console.error('Error loading offerings:', error);
      Alert.alert('Error', 'Failed to load subscription options');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!monthlyPackage) {
      Alert.alert('Error', 'Subscription package not available');
      return;
    }

    setPurchasing(true);
    try {
      const customerInfo = await purchaseMonthly();
      
      if (isPremium(customerInfo)) {
        Alert.alert('Success', 'Premium unlocked!', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert('Error', 'Purchase completed but premium not activated');
      }
    } catch (error: any) {
      if (error.message === 'Purchase was cancelled') {
        // User cancelled - don't show error
        return;
      }
      Alert.alert('Error', error.message || 'Failed to complete purchase');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const customerInfo = await restore();
      
      if (isPremium(customerInfo)) {
        Alert.alert('Success', 'Purchases restored! Premium unlocked.', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert('No Purchases', 'No active subscriptions found to restore.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases');
    } finally {
      setRestoring(false);
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

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Upgrade to Premium</Text>
        <Text style={styles.subtitle}>Unlock the full Sculptr experience</Text>

        <View style={styles.featuresContainer}>
          <FeatureItem icon="🤖" text="Full AI Coach" description="Get personalized plan adjustments and coaching" />
          <FeatureItem icon="📊" text="Advanced Check-Ins" description="Weekly automated plan optimization" />
          <FeatureItem icon="📷" text="Barcode Scanner" description="Quick food logging with camera" />
          <FeatureItem icon="🍎" text="Food Library" description="Access to extensive nutrition database" />
          <FeatureItem icon="📈" text="Progress Tracking" description="Detailed analytics and insights" />
        </View>

        <View style={styles.pricingCard}>
          <Text style={styles.pricingTitle}>Premium</Text>
          <Text style={styles.pricingAmount}>{price}/mo</Text>
          <Text style={styles.pricingSubtext}>Cancel anytime</Text>
        </View>

        <TouchableOpacity
          style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing || !monthlyPackage}
        >
          {purchasing ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.purchaseButtonText}>Start Premium</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.restoreButton, restoring && styles.restoreButtonDisabled]}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator color={colors.textDim} size="small" />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function FeatureItem({ icon, text, description }: { icon: string; text: string; description: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureTextContainer}>
        <Text style={styles.featureText}>{text}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
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
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textDim,
    marginBottom: 32,
    textAlign: 'center',
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: colors.textDim,
  },
  pricingCard: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  pricingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  pricingAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  pricingSubtext: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.9,
  },
  purchaseButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  restoreButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  restoreButtonDisabled: {
    opacity: 0.6,
  },
  restoreButtonText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
});

