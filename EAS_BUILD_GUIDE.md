# EAS Build Setup Guide

## Quick Start

### 1. Login to EAS (if not already logged in)
```bash
npx eas login
```

### 2. Configure the project (first time only)
```bash
npx eas build:configure
```

### 3. Build for iOS Development
```bash
npx eas build --profile development --platform ios
```

This will:
- Build a development client with native modules (including HealthKit)
- Allow you to test health sync features
- Create a build that can be installed on your device

### 4. Build for Android Development
```bash
npx eas build --profile development --platform android
```

## Build Profiles

- **development**: For testing with native modules (includes HealthKit)
- **preview**: For internal testing without dev client
- **production**: For App Store/Play Store releases

## After Building

1. EAS will provide a download link when the build completes
2. Install the build on your device
3. Run `npx expo start --dev-client` to connect to the development server
4. The app will load with native modules enabled

## Testing Health Sync

Once you have the development build:
1. Open the app
2. Go to Settings → Health App Sync
3. Enable sync and grant permissions
4. Check Home screen for synced steps
5. Complete a workout to test workout sync

## Notes

- Development builds take ~15-20 minutes
- You need an Expo account (free tier works)
- iOS builds require an Apple Developer account (free works for development)
- Android builds work with a free Google account
