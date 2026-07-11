const { slugify } = require('../src/utils/slug');

describe('slugify', () => {
    test('lowercases and hyphenates', () => {
        expect(slugify('Two Sum')).toBe('two-sum');
    });

    test('strips punctuation', () => {
        expect(slugify('K-Nearest Neighbors!')).toBe('k-nearest-neighbors');
    });

    test('collapses repeated separators and trims', () => {
        expect(slugify('  Hello   World__Again  ')).toBe('hello-world-again');
    });

    test('handles empty/undefined input', () => {
        expect(slugify('')).toBe('');
        expect(slugify(undefined)).toBe('');
    });
});
