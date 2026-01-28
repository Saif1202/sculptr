# RevenueCat Setup Guide for SculptR

Follow these steps to connect your SculptR app to RevenueCat and enable in-app subscriptions.

---

## Step 1: Create a RevenueCat Account

1. Go to [https://www.revenuecat.com](https://www.revenuecat.com) and sign up.
2. Create a new project (e.g. "SculptR").
3. Note your **Project API Key** (you’ll use platform-specific keys in the app).

---

## Step 2: Connect App Store Connect (iOS)

1. In RevenueCat dashboard: **Project Settings → Apps → + New**.
2. Select **Apple App Store**.
3. **App Store Connect API Key** (recommended):
   - In [App Store Connect](https://appstoreconnect.apple.com): **Users and Access → Keys → App Store Connect API**.
   - Create a key with **App Manager** or **Admin** role.
   - Download the `.p8` file once (keep it safe).
   - In RevenueCat: upload the `.p8`, enter **Key ID**, **Issuer ID**, and **Bundle ID** (e.g. `com.sculptr.app`).
4. Or use **Shared Secret** (legacy): App Store Connect → Your App → App Information → App-Specific Shared Secret; paste into RevenueCat.

---

## Step 3: Connect Google Play (Android)

1. In RevenueCat: **Project Settings → Apps → + New**.
2. Select **Google Play Store**.
3. Create a **Google Cloud service account**:
   - [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create Credentials → Service Account.
   - Create key (JSON), download it.
   - In [Google Play Console](https://play.google.com/console): Setup → API access → Link the service account and grant **View financial data** and **Manage orders**.
4. In RevenueCat: upload the JSON key and enter your **Package name** (e.g. `com.sculptr.app`).

---

## Step 4: Create Products in the Stores

**iOS (App Store Connect)**  
1. Your App → **Subscriptions** → create a **Subscription Group** (e.g. "Premium").  
2. Add a subscription (e.g. **Monthly**) with price and duration.  
3. Copy the **Product ID** (e.g. `sculptr_monthly`).

**Android (Google Play Console)**  
1. Your App → **Monetize** → **Subscriptions** → create a **Base plan** (e.g. monthly).  
2. Copy the **Product ID** (e.g. `sculptr_monthly`).

---

## Step 5: Create an Offering in RevenueCat

1. In RevenueCat: **Products → Offerings**.
2. Create an **Offering** (e.g. "default").
3. Add a **Package** (e.g. **Monthly**).
4. Attach the **Product IDs** you created in App Store Connect and Google Play for that package.
5. Set this offering as **Current**.

---

## Step 6: Get Your Public API Keys

1. In RevenueCat: **Project Settings → API Keys**.
2. Copy:
   - **Public iOS API key** (starts with `appl_` for production or use a test key in sandbox).
   - **Public Android API key** (starts with `goog_`).

---

## Step 7: Add Keys to SculptR

1. Open **`src/lib/billing.ts`** in the project.
2. Replace the placeholder keys:

```ts
const RC_IOS_KEY = 'appl_YOUR_IOS_KEY_HERE';
const RC_ANDROID_KEY = 'goog_YOUR_ANDROID_KEY_HERE';
```

3. Use **test/sandbox** keys while developing; switch to **live** keys for production.

---

## Step 8: Entitlements (Premium)

1. In RevenueCat: **Project Settings → Entitlements**.
2. Create an entitlement (e.g. **premium**).
3. Attach your subscription products to this entitlement.
4. The app already checks `entitlements.active['premium']` in `src/lib/billing.ts` and `isPremium()`.

---

## Step 9: Test Purchases

**iOS**  
- Use a **Sandbox** Apple ID (App Store Connect → Users and Access → Sandbox Testers).  
- Run the app on a device/simulator and trigger a purchase; complete it in the sandbox flow.

**Android**  
- Add **License testers** in Play Console (Setup → License testing).  
- Build an **internal testing** or **closed track** and install that build to test purchases.

---

## Step 10: Optional – User Attributes

To see users in RevenueCat by email or name:

- After `Purchases.logIn(userId)`, call:
  - `Purchases.setEmail(user.email)`  
  - `Purchases.setDisplayName(user.displayName)`  
  (You can add these in `initPurchases()` in `billing.ts` if you have access to the Firebase user object.)

---

## Checklist

- [ ] RevenueCat project created  
- [ ] App Store Connect app linked (API key or Shared Secret)  
- [ ] Google Play app linked (service account)  
- [ ] Subscription products created in both stores  
- [ ] RevenueCat Offering and Package created with correct Product IDs  
- [ ] Entitlement (e.g. `premium`) created and attached to products  
- [ ] Public API keys added in `src/lib/billing.ts`  
- [ ] Sandbox/test purchases verified on iOS and Android  

After this, the existing paywall and `initPurchases(userId)` in `_layout.tsx` will use your RevenueCat project. Replace test keys with live keys when you ship to production.
