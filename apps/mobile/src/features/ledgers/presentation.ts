import { formatYuan } from '@tongzhang/domain';

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
