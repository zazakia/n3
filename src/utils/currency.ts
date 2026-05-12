const phpFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Coerce synced / DB values to a finite number for arithmetic.
 * Prevents string operands from breaking reducers (e.g. cash balance explosions on web).
 */
export function coerceMoneyAmount(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Format a number as Philippine Peso currency string.
 * Example: formatPHP(1500) → "PHP 1,500.00"
 */
export function formatPHP(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || isNaN(amount)) return 'PHP 0.00';
    // Replace non-breaking space with regular space for consistency if desired
    return phpFormatter.format(amount).replace(/\xA0/g, ' ');
}

/**
 * Parse a PHP-formatted string back to a number.
 */
export function parsePHP(value: string): number {
    const cleaned = value.replace(/[₱,A-Za-z\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format a number as a compact PHP value (for KPI cards).
 * Example: formatPHPCompact(1500000) → "PHP 1.5M"
 */
export function formatPHPCompact(amount: number): string {
    if (Math.abs(amount) >= 1_000_000) {
        return `PHP ${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1_000) {
        return `PHP ${(amount / 1_000).toFixed(1)}K`;
    }
    return formatPHP(amount);
}
