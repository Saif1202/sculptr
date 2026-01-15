import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeType } from 'expo-camera';
import { colors } from '../../src/theme';
import { getFoodByBarcode } from '../../src/lib/library';
import { lookupBarcodeOFF, type FoodItem } from '../../src/lib/food';
import { db } from '../../src/lib/firebase';

interface FoodScannerProps {
  visible: boolean;
  onClose: () => void;
  onResult: (food: FoodItem & { id?: string }) => void;
}

const supportedTypes: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

export function FoodScannerModal({ visible, onClose, onResult }: FoodScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showPermissionScreen, setShowPermissionScreen] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string>('Align barcode within the frame');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setScanning(false);
      setMessage('Align barcode within the frame');
      setShowPermissionScreen(true);
      setHasPermission(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || showPermissionScreen) return;
    // Only check permission after user has clicked "Next"
    (async () => {
      if (!permission) {
        const { status } = await requestPermission();
        setHasPermission(status === 'granted');
      } else {
        setHasPermission(permission.granted);
      }
    })();
  }, [visible, permission, requestPermission, showPermissionScreen]);

  const handleNext = async () => {
    setShowPermissionScreen(false);
    if (!permission) {
      const { status } = await requestPermission();
      setHasPermission(status === 'granted');
    } else {
      setHasPermission(permission.granted);
    }
  };

  const handleBack = () => {
    onClose();
  };

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (!data || scanning) return;
      setScanning(true);
      setMessage('Searching…');

      try {
        const barcode = data.trim();
        if (!barcode) {
          setMessage('Invalid barcode');
          setScanning(false);
          return;
        }

        const localFood = await getFoodByBarcode(db, barcode);
        if (localFood) {
          onResult(localFood);
          return;
        }

        const remoteFood = await lookupBarcodeOFF(barcode);
        if (remoteFood) {
          onResult(remoteFood);
          return;
        }

        setMessage('Not found. Try again or search manually.');
      } catch (error) {
        console.warn('Barcode lookup failed', error);
        setMessage('Error scanning. Try again.');
      } finally {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          setScanning(false);
          setMessage('Align barcode within the frame');
        }, 2000);
      }
    },
    [scanning, onResult]
  );

  if (!visible) return null;

  // Show permission screen first (before requesting system permission)
  if (showPermissionScreen) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Allow SculptR to access Camera?</Text>
          <Text style={styles.permissionDescription}>
            We need camera access to scan barcodes and identify food products.
          </Text>
          <View style={styles.permissionButtons}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Show denied permission screen if user denied after clicking Next
  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera access is required to scan barcodes.</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={async () => {
            const { status } = await requestPermission();
            setHasPermission(status === 'granted');
          }}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionClose} onPress={onClose}>
            <Text style={styles.permissionCloseText}>Back</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!hasPermission ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Requesting camera access…</Text>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: supportedTypes }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.overlay}>
              <View style={styles.topBar}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.viewfinderContainer}>
                <View style={styles.viewfinder}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </View>
              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>{message}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 24,
  },
  topBar: {
    marginTop: 40,
  },
  closeText: {
    color: 'white',
    fontSize: 18,
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinder: {
    width: 280,
    height: 180,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 12,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'white',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  messageContainer: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  messageText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionDescription: {
    color: colors.textDim,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  permissionButtons: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 400,
  },
  backButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginLeft: 8,
  },
  nextButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  permissionText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permissionButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  permissionClose: {
    marginTop: 20,
  },
  permissionCloseText: {
    color: colors.textDim,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textDim,
    marginTop: 12,
  },
});

export default FoodScannerModal;

