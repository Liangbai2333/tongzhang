/** Design-only fixtures from Figma; never enter API/query/session storage. */
import { formatYuan } from '@tongzhang/domain';
export const yuan = (cents: string) => formatYuan(BigInt(cents));
export const previewMembers = [
  { name: '小安', initial: '安', paid: '12000', share: '9000', net: '3000' },
  { name: '小白', initial: '白', paid: '12000', share: '6000', net: '6000' },
  { name: '小陈', initial: '陈', paid: '6000', share: '9000', net: '-3000' },
  { name: '小丁', initial: '丁', paid: '0', share: '6000', net: '-6000' },
] as const;
export const previewExpenses = [
  {
    id: 'lunch',
    title: '食堂午餐',
    payer: '小安',
    category: '餐饮',
    cents: '12000',
    icon: 'imgGlyph',
  },
  {
    id: 'ticket',
    title: '鼓山门票',
    payer: '小白',
    category: '门票',
    cents: '12000',
    icon: 'imgGlyph1',
  },
  {
    id: 'car',
    title: '往返车费',
    payer: '小陈',
    category: '交通',
    cents: '6000',
    icon: 'imgGlyph2',
  },
] as const;
export const categories = ['餐饮', '交通', '门票', '住宿', '购物', '其他'] as const;
