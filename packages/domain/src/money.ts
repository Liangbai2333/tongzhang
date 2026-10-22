/** Monetary values never pass through a floating-point conversion. */
export const MONEY_SCALE = 2;
const MAX_CENTS = 9_223_372_036_854_775_807n;
const MIN_CENTS = -9_223_372_036_854_775_808n;

export function parseYuan(input: string): bigint {
  if (!/^-?(0|[1-9]\d{0,16})(\.\d{1,2})?$/.test(input)) {
    throw new Error('金额必须为十进制数字，最多两位小数');
  }
  const negative = input.startsWith('-');
  const [whole = '0', fraction = ''] = input.replace(/^-/, '').split('.');
  const absolute = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const cents = negative ? -absolute : absolute;
  if (cents < MIN_CENTS || cents > MAX_CENTS) throw new Error('金额超出存储范围');
  return cents;
}

export function formatYuan(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
