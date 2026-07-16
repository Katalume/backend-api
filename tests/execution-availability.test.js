describe('execution availability middleware', () => {
    const originalMode = process.env.EXECUTION_MODE;

    afterEach(() => {
        jest.resetModules();
        if (originalMode === undefined) delete process.env.EXECUTION_MODE;
        else process.env.EXECUTION_MODE = originalMode;
    });

    test('allows requests when Judge0 execution is configured', () => {
        process.env.EXECUTION_MODE = 'judge0';
        jest.isolateModules(() => {
            const { requireServerExecution } = require('../src/middleware/executionAvailability');
            const next = jest.fn();
            requireServerExecution({}, {}, next);
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    test('returns an explicit 503 in the zero-cost browser-execution tier', () => {
        process.env.EXECUTION_MODE = 'disabled';
        jest.isolateModules(() => {
            const { requireServerExecution } = require('../src/middleware/executionAvailability');
            const json = jest.fn();
            const res = { status: jest.fn(() => ({ json })) };
            requireServerExecution({ requestId: 'req-1' }, res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(503);
            expect(json).toHaveBeenCalledWith(expect.objectContaining({
                code: 'SERVER_EXECUTION_UNAVAILABLE',
                requestId: 'req-1',
            }));
        });
    });
});
