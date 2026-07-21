import { describe, expect, it } from 'vitest';
import { addBaisa, calculateLineTotal, formatBaisa, parseOmanRial } from '../../src/server/domain/money';

describe('OMR money helpers', () => {
  it('stores Omani Rial as integer baisa and formats with three decimals', () => {
    expect(parseOmanRial('12.345')).toBe(12345);
    expect(formatBaisa(12345)).toBe('OMR 12.345');
    expect(formatBaisa(12000)).toBe('OMR 12.000');
  });

  it('rounds tax per line without floating point drift', () => {
    expect(calculateLineTotal({ unitPriceBaisa: 1250, quantity: 3, taxRateBps: 500 })).toEqual({
      subtotalBaisa: 3750,
      taxBaisa: 188,
      totalBaisa: 3938
    });
    expect(addBaisa([100, 250, 50])).toBe(400);
  });
});
