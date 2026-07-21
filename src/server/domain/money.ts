const OMR_FRACTION_DIGITS = 3;
const BAISA_PER_RIAL = 1000;

export type LineInput = {
  unitPriceBaisa: number;
  quantity: number;
  taxRateBps: number;
};

export function parseOmanRial(value: string): number {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) {
    throw new Error('Amount must be an OMR value with up to three decimals');
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * BAISA_PER_RIAL + Number(fraction.padEnd(OMR_FRACTION_DIGITS, '0'));
}

export function formatBaisa(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const rial = Math.floor(absolute / BAISA_PER_RIAL);
  const baisa = String(absolute % BAISA_PER_RIAL).padStart(OMR_FRACTION_DIGITS, '0');
  return `${sign}OMR ${rial}.${baisa}`;
}

export function calculateLineTotal(input: LineInput) {
  const subtotalBaisa = input.unitPriceBaisa * input.quantity;
  const taxBaisa = Math.round((subtotalBaisa * input.taxRateBps) / 10_000);
  return {
    subtotalBaisa,
    taxBaisa,
    totalBaisa: subtotalBaisa + taxBaisa
  };
}

export function addBaisa(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}
