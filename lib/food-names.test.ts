import { describe, expect, it } from 'vitest';
import { areSameCanonicalFoodName, canonicalizeFoodName, normalizeFoodName } from './food-names';

describe('food names across supported languages', () => {
  it('keeps Chinese dishes distinct and applies only matching approved merges', () => {
    const merges = [{ sourceName: '炒饭', canonicalName: '蛋炒饭' }];
    expect(normalizeFoodName('炒饭')).toBe('炒饭');
    expect(areSameCanonicalFoodName('炒饭', '饺子', merges)).toBe(false);
    expect(canonicalizeFoodName('饺子', merges)).toBe('饺子');
    expect(canonicalizeFoodName('炒饭', merges)).toBe('蛋炒饭');
    expect(normalizeFoodName('Crème & Café')).toBe('creme and cafe');
  });
});
