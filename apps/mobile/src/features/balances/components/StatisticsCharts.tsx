import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { Category, Statistics } from '@tongzhang/contracts';
import { formatYuan } from '@tongzhang/domain';
import { ui } from '@/components/Screen';
import { categoryLabel } from '@/features/expenses/presentation';
import { netAmount, netColor, yuan } from '@/features/ledgers/presentation';
import { colors } from '@/theme/tokens';

export const CATEGORY_CHART_COLORS: Record<Category, string> = {
  DINING: '#F4A62A',
  TRANSPORT: '#4A90B8',
  TICKET: '#236B52',
  LODGING: '#8B6BB8',
  SHOPPING: '#D96B52',
  OTHER: '#8C857B',
};

/** Exact integer-scaled ratio in [0, 1]; never divides by zero or produces NaN. */
export function centsRatio(partCents: string, totalCents: bigint): number {
  if (totalCents <= 0n) return 0;
  const part = BigInt(partCents);
  if (part <= 0n) return 0;
  const scaled = Number((part * 10000n) / totalCents);
  return Math.max(0, Math.min(1, scaled / 10000));
}

export function CategoryDonutChart({
  categories,
  totalCents,
}: {
  categories: Statistics['categories'];
  totalCents: string;
}) {
  const total = BigInt(totalCents);
  const size = 160;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.card}>
      <Text style={ui.heading}>分类占比</Text>
      <View style={styles.donutWrap}>
        <View style={styles.donutCanvas}>
          <Svg
            testID="category-donut-svg"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
          >
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.border}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
              {categories.map((item) => {
                const ratio = centsRatio(item.amountCents, total);
                const segment = ratio * circumference;
                const currentOffset = offset;
                offset += segment;
                return (
                  <Circle
                    key={item.category}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={CATEGORY_CHART_COLORS[item.category]}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${segment} ${Math.max(0, circumference - segment)}`}
                    strokeDashoffset={-currentOffset}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })}
            </G>
          </Svg>
          <View pointerEvents="none" style={styles.donutCenter}>
            <Text style={ui.caption}>总支出</Text>
            <Text numberOfLines={1} style={styles.donutTotal}>
              {yuan(totalCents)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.legendList}>
        {categories.map((item) => (
          <View key={item.category} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: CATEGORY_CHART_COLORS[item.category] }]} />
            <Text style={[ui.strong, ui.grow]}>{categoryLabel(item.category)}</Text>
            <Text style={ui.caption}>
              {item.expenseCount} 笔 · {item.percentage}%
            </Text>
            <Text style={styles.amountText}>{yuan(item.amountCents)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function DailyTrendChart({
  dailyTrend,
  truncated,
}: {
  dailyTrend: Statistics['dailyTrend'];
  truncated: boolean;
}) {
  const maxCents = dailyTrend.reduce(
    (max, item) => (BigInt(item.amountCents) > max ? BigInt(item.amountCents) : max),
    1n,
  );
  const chartHeight = 148;
  const topPad = 24;
  const bottomPad = 28;
  const plotHeight = chartHeight - topPad - bottomPad;
  const slotWidth = 48;
  const barWidth = 22;
  const svgWidth = Math.max(280, dailyTrend.length * slotWidth + 24);

  return (
    <View style={styles.card}>
      <View style={ui.between}>
        <Text style={ui.heading}>按日消费趋势</Text>
        <Text style={ui.caption}>共 {dailyTrend.length} 天</Text>
      </View>
      {truncated && (
        <View style={styles.truncationBanner}>
          <Text style={styles.truncationText}>
            账本消费天数超过上限，当前仅展示最近 {dailyTrend.length} 天的按日趋势。
          </Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg
          testID="daily-trend-svg"
          width={svgWidth}
          height={chartHeight}
          viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        >
          <Line
            x1={8}
            y1={topPad}
            x2={svgWidth - 8}
            y2={topPad}
            stroke={colors.border}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Line
            x1={8}
            y1={topPad + plotHeight / 2}
            x2={svgWidth - 8}
            y2={topPad + plotHeight / 2}
            stroke={colors.border}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Line
            x1={8}
            y1={topPad + plotHeight}
            x2={svgWidth - 8}
            y2={topPad + plotHeight}
            stroke={colors.border}
            strokeWidth={1}
          />
          {dailyTrend.map((item, index) => {
            const ratio = centsRatio(item.amountCents, maxCents);
            const rawHeight = ratio * plotHeight;
            const barHeight = BigInt(item.amountCents) > 0n ? Math.max(4, rawHeight) : 0;
            const x = 12 + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = topPad + plotHeight - barHeight;
            const shortDate = item.date.slice(5);
            const shortAmount = `¥${formatYuan(BigInt(item.amountCents))}`;
            return (
              <G key={item.date}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={6}
                  fill={colors.primary}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={Math.max(12, y - 6)}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="middle"
                >
                  {shortAmount}
                </SvgText>
                <SvgText
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                  fontSize={10}
                  fill={colors.muted}
                  textAnchor="middle"
                >
                  {shortDate}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

export function MemberComparisonChart({ members }: { members: Statistics['members'] }) {
  const maxCents = members.reduce((max, item) => {
    const paid = BigInt(item.paidCents);
    const shared = BigInt(item.sharedCents);
    const localMax = paid > shared ? paid : shared;
    return localMax > max ? localMax : max;
  }, 1n);
  const trackWidth = 220;

  return (
    <View style={styles.card}>
      <View style={ui.between}>
        <Text style={ui.heading}>成员收支对比</Text>
        <View style={styles.legendInline}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <Text style={ui.caption}>已付</Text>
          <View style={[styles.dot, { backgroundColor: colors.success, marginLeft: 8 }]} />
          <Text style={ui.caption}>应摊</Text>
        </View>
      </View>
      <View style={styles.memberList}>
        {members.map((member) => {
          const paidWidth =
            BigInt(member.paidCents) > 0n
              ? Math.max(4, centsRatio(member.paidCents, maxCents) * trackWidth)
              : 0;
          const sharedWidth =
            BigInt(member.sharedCents) > 0n
              ? Math.max(4, centsRatio(member.sharedCents, maxCents) * trackWidth)
              : 0;
          return (
            <View key={member.memberId} style={styles.memberRow}>
              <View style={ui.between}>
                <Text style={ui.strong}>{member.username}</Text>
                <Text style={[ui.strong, { color: netColor(member.netCents) }]}>
                  {netAmount(member.netCents)}
                </Text>
              </View>
              <Text style={ui.caption}>
                已付 {yuan(member.paidCents)} · 应摊 {yuan(member.sharedCents)}
              </Text>
              <Svg
                testID={`member-bar-svg-${member.memberId}`}
                width="100%"
                height={24}
                viewBox={`0 0 ${trackWidth} 24`}
                preserveAspectRatio="none"
              >
                <Rect x={0} y={2} width={trackWidth} height={8} rx={4} fill={colors.background} />
                <Rect x={0} y={2} width={paidWidth} height={8} rx={4} fill={colors.primary} />
                <Rect x={0} y={14} width={trackWidth} height={8} rx={4} fill={colors.background} />
                <Rect x={0} y={14} width={sharedWidth} height={8} rx={4} fill={colors.success} />
              </Svg>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  donutWrap: { alignItems: 'center', paddingVertical: 4 },
  donutCanvas: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 100,
    gap: 2,
  },
  donutTotal: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  legendList: { gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  amountText: {
    minWidth: 74,
    textAlign: 'right',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  truncationBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
  },
  truncationText: { fontSize: 12, lineHeight: 18, color: colors.warning },
  memberList: { gap: 12 },
  memberRow: { gap: 4 },
});
