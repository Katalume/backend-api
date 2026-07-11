const { validateExecutionInput } = require('../src/utils/codeGuard');

describe('validateExecutionInput', () => {
    test('accepts allowed language and normal code', () => {
        const result = validateExecutionInput({ code: 'print(1)', languageId: 71 });
        expect(result.ok).toBe(true);
        expect(result.languageId).toBe(71);
    });

    test('accepts a numeric-string languageId', () => {
        const result = validateExecutionInput({ code: 'print(1)', languageId: '71' });
        expect(result.ok).toBe(true);
        expect(result.languageId).toBe(71);
    });

    test('rejects empty code', () => {
        const result = validateExecutionInput({ code: '', languageId: 71 });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    test('rejects non-string code', () => {
        const result = validateExecutionInput({ code: { $gt: '' }, languageId: 71 });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    test('rejects a disallowed language', () => {
        const result = validateExecutionInput({ code: 'print(1)', languageId: 9999 });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toMatch(/Unsupported language/);
    });

    test('rejects code larger than the size cap', () => {
        const big = 'a'.repeat(70000);
        const result = validateExecutionInput({ code: big, languageId: 71 });
        expect(result.ok).toBe(false);
        expect(result.status).toBe(413);
    });
});
