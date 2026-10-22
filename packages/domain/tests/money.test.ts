import { describe, expect, it } from 'vitest';
import { formatYuan, parseYuan } from '../src/index.js';

describe('integer-cent money', () => {
  it('avoids floating-point rounding and supports signed balances', () => {
    expect(parseYuan('0.29')).toBe(29n);
    expect(parseYuan('120.1')).toBe(12010n);
    expect(formatYuan(-6000n)).toBe('-60.00');
    expect(formatYuan(1n)).toBe('0.01');
  });
  it.each(['1.001', '1e3', '', 'NaN', '01', ' 1 '])('rejects ambiguous input %j', (input) => {
    expect(() => parseYuan(input)).toThrow();
  });
  it('keeps bigint precision and enforces PostgreSQL bigint limits', () => {
    expect(parseYuan('92233720368547758.07')).toBe(9223372036854775807n);
    expect(parseYuan('-92233720368547758.08')).toBe(-9223372036854775808n);
    expect(() => parseYuan('92233720368547758.08')).toThrow();
  });
});
