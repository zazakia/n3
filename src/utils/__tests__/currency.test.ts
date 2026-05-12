import { formatPHP, parsePHP, formatPHPCompact } from '../currency';

describe('currency utility', () => {
  describe('formatPHP', () => {
    it('formats a number as PHP currency', () => {
      const result = formatPHP(1500);
      expect(result).toContain('1,500.00');
      expect(result).toMatch(/[PH]/);
    });

    it('handles null, undefined, NaN', () => {
      expect(formatPHP(null)).toBe('PHP 0.00');
      expect(formatPHP(undefined)).toBe('PHP 0.00');
      expect(formatPHP(NaN)).toBe('PHP 0.00');
    });
  });

  describe('parsePHP', () => {
    it('parses currency string to number', () => {
      expect(parsePHP('PHP 1,500.00')).toBe(1500);
      expect(parsePHP('1500')).toBe(1500);
      expect(parsePHP('PHP 1,234.56')).toBe(1234.56);
    });

    it('handles empty or invalid strings', () => {
      expect(parsePHP('')).toBe(0);
      expect(parsePHP('invalid')).toBe(0);
    });
  });

  describe('formatPHPCompact', () => {
    it('formats millions', () => {
      expect(formatPHPCompact(1500000)).toBe('PHP 1.5M');
    });

    it('formats numbers in the thousands with K suffix', () => {
      expect(formatPHPCompact(15000)).toBe('PHP 15.0K');
    });
    it('formats small numbers normally', () => {
      expect(formatPHPCompact(500)).toContain('500.00');
    });
  });
});
