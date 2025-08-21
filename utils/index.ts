import * as Notifications from 'expo-notifications';
import { BarCodeScanner } from 'expo-barcode-scanner';
import axios from 'axios';

export const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_BASE_URL });

export async function requestNotificationPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function requestBarcodePermissions() {
  const { status } = await BarCodeScanner.requestPermissionsAsync();
  return status === 'granted';
}

