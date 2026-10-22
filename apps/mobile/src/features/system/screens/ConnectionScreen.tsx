import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  healthResponseSchema,
  readyResponseSchema,
  systemInfoResponseSchema,
} from '@tongzhang/contracts';
import { formatYuan, parseYuan } from '@tongzhang/domain';
import { Button } from '@/components/Button';
import { apiBaseUrl, getJson } from '@/lib/http';
import { colors, spacing } from '@/theme/tokens';

/** Temporary engineering entry; replaced by the authenticated ledger list in phase 2. */
export default function ConnectionScreen() {
  const connection = useQuery({
    queryKey: ['system', 'connection', apiBaseUrl],
    queryFn: async () =>
      Promise.all([
        getJson('/health/live', healthResponseSchema),
        getJson('/health/ready', readyResponseSchema),
        getJson('/api/v1/system/info', systemInfoResponseSchema),
      ]),
  });
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>TONGZHANG · DEVELOPMENT</Text>
        <Text style={styles.title}>同账</Text>
        <Text style={styles.subtitle}>工程联调</Text>
        <View style={styles.card}>
          <Text style={styles.label}>服务连接</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, connection.isError && styles.error]}
          >
            {connection.isFetching
              ? '正在检查…'
              : connection.isError
                ? '连接未就绪'
                : 'API 与数据库已连接'}
          </Text>
          <Text selectable style={styles.body}>
            {apiBaseUrl}
          </Text>
          {connection.isError && <Text style={styles.error}>{connection.error.message}</Text>}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>共享包校验</Text>
          <Text style={styles.body}>接口返回使用 contracts 校验。</Text>
          <Text style={styles.body}>domain 金额格式：¥{formatYuan(parseYuan('120.00'))}</Text>
        </View>
        <Button
          title="重新检查连接"
          loading={connection.isFetching}
          onPress={() => {
            void connection.refetch();
          }}
        />
        <Text style={styles.note}>当前为工程骨架。账本、登录与记账将在后续阶段接入。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, marginTop: spacing.xl },
  title: { color: colors.text, fontSize: 40, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 18, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.muted, fontSize: 14 },
  status: { color: colors.success, fontSize: 20, fontWeight: '600' },
  body: { color: colors.text, fontSize: 14, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
