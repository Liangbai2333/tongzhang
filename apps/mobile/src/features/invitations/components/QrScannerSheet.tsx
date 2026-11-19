import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { InlineError } from '@/components/Feedback';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';

export function QrScannerSheet({
  visible,
  error,
  onScanned,
  onRetryScan,
  onClose,
}: {
  visible: boolean;
  error: string | null;
  onScanned: (payload: string) => void;
  onRetryScan: () => void;
  onClose: () => void;
}) {
  const locked = useRef(false);

  useEffect(() => {
    if (visible && !error) locked.current = false;
  }, [visible, error]);

  function handleBarcode(result: BarcodeScanningResult) {
    if (locked.current || error) return;
    locked.current = true;
    onScanned(result.data);
  }

  return (
    <Sheet visible={visible} title="扫描邀请二维码" variant="join" onClose={onClose}>
      {visible && (
        <>
          <View style={styles.cameraBox}>
            <CameraView
              testID="invite-qr-camera"
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={error ? undefined : handleBarcode}
            />
            <View pointerEvents="none" style={styles.frameOverlay}>
              <View style={styles.scanFrame} />
            </View>
          </View>
          <Text style={ui.caption}>
            将账本创建者的邀请二维码放入框内，识别后将自动核对账本信息。
          </Text>
          <InlineError message={error} />
          {error && (
            <Button
              compact
              title="重新扫描"
              variant="secondary"
              onPress={() => {
                locked.current = false;
                onRetryScan();
              }}
            />
          )}
          <Button compact title="改用手输邀请码" variant="outlined" onPress={onClose} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cameraBox: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111111',
    position: 'relative',
  },
  camera: { flex: 1 },
  frameOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 180,
    height: 180,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
});
