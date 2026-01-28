# SculptR – Apple & Android Standards Checklist

Use this checklist to ensure the app meets store and platform guidelines.

---

## Apple App Store (iOS)

- [ ] **Privacy**
  - [ ] `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` in `app.json` (HealthKit)
  - [ ] `NSCameraUsageDescription` for barcode scanning
  - [ ] App Privacy “Nutrition” and “Fitness” if you collect health data; declare in App Store Connect
- [ ] **Capabilities**
  - [ ] HealthKit entitlement configured in `app.json` and in Apple Developer portal
  - [ ] Sign in with Apple if you offer third-party login (optional)
- [ ] **UI**
  - [ ] Supports portrait (configured in `app.json`)
  - [ ] Supports Dynamic Type / accessibility text where relevant
  - [ ] Safe area respected (react-native-safe-area-context in use)
- [ ] **Back / Navigation**
  - [ ] Back gestures and navigation behave correctly (expo-router)
- [ ] **In-App Purchase**
  - [ ] Subscriptions via RevenueCat; restore purchases available (Settings / Paywall)
  - [ ] No external links for purchasing same subscription (store policy)

---

## Google Play (Android)

- [ ] **Permissions**
  - [ ] Only requested when needed: Camera, Activity recognition, etc. (see `app.json` → `android.permissions`)
  - [ ] Runtime permission handling for dangerous permissions if you add them later
- [ ] **Target SDK**
  - [ ] Target SDK set by Expo/EAS (e.g. 34). Confirm in `eas.json` / build logs
- [ ] **UI**
  - [ ] Edge-to-edge and predictive back supported (`app.json`: `edgeToEdgeEnabled`, `predictiveBackGestureEnabled`)
  - [ ] Keyboard resizing: `softwareKeyboardLayoutMode: "pan"` in `app.json`
- [ ] **In-App Purchase**
  - [ ] Billing via RevenueCat (Google Play Billing); restore available
  - [ ] No alternative payment link for same subscription in the app

---

## Both Platforms

- [ ] **Stability**
  - [ ] No crashes on main flows (e.g. Create Workout, AI generate, meal plan)
  - [ ] Defensive checks for null/undefined (e.g. workout builder, exercise list)
- [ ] **Offline / Errors**
  - [ ] Graceful errors and optional offline behavior where implemented (e.g. local workout save)
- [ ] **Animations**
  - [ ] Press feedback on buttons (e.g. `activeOpacity` / `pressOpacity`)
  - [ ] Screen transitions via expo-router / stack options
- [ ] **RevenueCat**
  - [ ] API keys in `src/lib/billing.ts` (use live keys for production)
  - [ ] Entitlement id matches dashboard (e.g. `premium`)
  - [ ] See `REVENUECAT_SETUP.md` for full setup

---

## Quick Reference (app.json)

- **iOS**: `bundleIdentifier`, `infoPlist` usage strings, `entitlements`
- **Android**: `package`, `permissions`, `adaptiveIcon`, `softwareKeyboardLayoutMode`, `predictiveBackGestureEnabled`

Update this checklist as you add features or change permissions.
