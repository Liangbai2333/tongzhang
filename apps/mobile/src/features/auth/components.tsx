import { Text, View, StyleSheet } from 'react-native';
import { Button } from '@/components/Button';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/providers/AuthProvider';
export { InlineError as FormError } from '@/components/Feedback';

export function AuthNotice() {
  const { notice, dismissNotice, clearLocal, operation } = useAuth();
  if (!notice) return null;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Text style={ui.body}>{notice}</Text>
      {notice.includes('未能完全清除') ? (
        <Button
          title="重试清除本机凭据"
          loading={operation === 'logout'}
          onPress={() => {
            void clearLocal();
          }}
        />
      ) : (
        <Button title="知道了" variant="quiet" onPress={dismissNotice} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, padding: 16, borderRadius: 16, gap: 4 },
});
