import { formatYuan } from '@tongzhang/domain';
import { colors } from '@/theme/tokens';

export const covers = {
  mountain: { label: '山野出游', color: '#DDF3E8' },
  dining: { label: '好友聚餐', color: '#FFE4DA' },
  city: { label: '城市漫步', color: '#DFF0FA' },
  plain: { label: '简约日常', color: '#FFF1D6' },
} as const;
export type CoverKey = keyof typeof covers;
export const statusLabels = { ACTIVE: '进行中', SETTLING: '结算中', SETTLED: '已结清' } as const;
export const yuan = (cents: string) => `¥${formatYuan(BigInt(cents))}`;
export function remaining(cents: string) {
  const value = BigInt(cents);
  return value === 0n
    ? '已平衡'
    : `${value > 0n ? '待收' : '待付'} ${yuan((value < 0n ? -value : value).toString())}`;
}

/** Remaining net from the viewer's side: positive is owed to them, negative is what they owe. */
export const netLabel = (cents: string) =>
  BigInt(cents) > 0n ? '待收回' : BigInt(cents) < 0n ? '待支付' : '待收付';
export const netAmount = (cents: string) => {
  const value = BigInt(cents);
  return value === 0n ? '已平衡' : yuan((value < 0n ? -value : value).toString());
};
export const netColor = (cents: string) =>
  BigInt(cents) > 0n ? colors.success : BigInt(cents) < 0n ? colors.danger : colors.muted;
