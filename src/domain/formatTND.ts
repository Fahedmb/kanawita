export interface FormatTNDOptions {
  showSuffix?: boolean;
  suffix?: 'DT' | 'TND';
  showPlusSign?: boolean;
  maximumFractionDigits?: number;
}

/**
 * Rounds a number to 3 decimal places (1 millime precision in TND)
 * to eliminate IEEE-754 floating point artifacts (e.g. 4.500000000000001 -> 4.5).
 */
export const roundTND = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
};

/**
 * Formats a Tunisian Dinar amount without ever forcing trailing zeros.
 * Examples:
 * - 4.5 -> "4.5 DT"
 * - 0.2 -> "0.2 DT"
 * - 12 -> "12 DT"
 * - 1450.75 -> "1,450.75 DT"
 * - 1.255 -> "1.255 DT"
 */
export const formatTND = (
  amount: number,
  options: FormatTNDOptions = {}
): string => {
  const {
    showSuffix = true,
    suffix = 'DT',
    showPlusSign = false,
    maximumFractionDigits = 3,
  } = options;

  const cleaned = roundTND(amount);
  const isNegative = cleaned < 0;
  const absVal = Math.abs(cleaned);

  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(absVal);

  const signPrefix = isNegative
    ? '-'
    : showPlusSign && cleaned > 0
      ? '+'
      : '';

  return showSuffix
    ? `${signPrefix}${formattedNumber} ${suffix}`
    : `${signPrefix}${formattedNumber}`;
};

export const MAX_KEYPAD_AMOUNT = 999999;

/**
 * Appends a digit ('0'-'9') or decimal separator ('.') to the Speed-Pad input string.
 * Enforces:
 * - At most 1 decimal point
 * - At most 3 decimal places (millimes)
 * - Clean leading zero behavior ("0" + "4" -> "4", "." -> "0.")
 * - Maximum cap of 999,999 DT
 */
export const appendKeypadKey = (current: string, key: string): string => {
  const normalizedCurrent = current === '0' ? '' : current;

  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' || current === '0' ? '0.' : `${current}.`;
  }

  if (!/^\d$/.test(key)) {
    return current;
  }

  if (current.includes('.')) {
    const [, fraction = ''] = current.split('.');
    if (fraction.length >= 3) {
      return current;
    }
    const candidate = `${current}${key}`;
    return Number(candidate) <= MAX_KEYPAD_AMOUNT ? candidate : current;
  }

  if (normalizedCurrent === '' && key === '0') {
    return '0';
  }

  const candidate = `${normalizedCurrent}${key}`;
  if (Number(candidate) > MAX_KEYPAD_AMOUNT) {
    return current;
  }

  return candidate;
};

/**
 * Removes the last character from the Speed-Pad input string.
 */
export const backspaceKeypad = (current: string): string => {
  if (!current || current.length <= 1) return '0';
  const sliced = current.slice(0, -1);
  return sliced === '' || sliced === '-' ? '0' : sliced;
};

/**
 * Adds a quick chip delta (+1, +5, +10 DT) to the current Speed-Pad value
 * and returns a clean string without trailing zeros.
 */
export const addQuickAmount = (current: string, delta: number): string => {
  const currentNum = parseKeypadAmount(current);
  const nextVal = roundTND(currentNum + delta);
  if (nextVal <= 0) return '0';
  if (nextVal > MAX_KEYPAD_AMOUNT) return String(MAX_KEYPAD_AMOUNT);
  return String(nextVal);
};

/**
 * Parses a Speed-Pad string into a numeric TND amount.
 */
export const parseKeypadAmount = (raw: string): number => {
  if (!raw || raw.trim() === '' || raw === '.') return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundTND(parsed);
};
