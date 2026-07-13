const mockApi = { post: jest.fn(), get: jest.fn() };

jest.mock('axios', () => ({
    create: jest.fn(() => mockApi),
}));

const judgeService = require('../src/services/judge.service');

describe('JudgeService', () => {
    beforeEach(() => jest.clearAllMocks());

    test('submits asynchronously, propagates limits, and polls to a terminal verdict', async () => {
        mockApi.post.mockResolvedValue({ data: { token: 'judge-token' } });
        mockApi.get
            .mockResolvedValueOnce({ data: { status: { id: 2, description: 'Processing' } } })
            .mockResolvedValueOnce({ data: { status: { id: 3, description: 'Accepted' }, stdout: 'b2s=' } });

        const result = await judgeService.executePayload({
            source_code: 'print(1)',
            language_id: 71,
            stdin: '1',
            expected_output: '1',
            cpu_time_limit: 1.5,
            memory_limit: 64000,
        });

        expect(mockApi.post).toHaveBeenCalledWith(
            '/submissions?base64_encoded=true&wait=false',
            expect.objectContaining({
                source_code: Buffer.from('print(1)').toString('base64'),
                stdin: Buffer.from('1').toString('base64'),
                expected_output: Buffer.from('1').toString('base64'),
                cpu_time_limit: 1.5,
                memory_limit: 64000,
                wall_time_limit: 3,
                max_file_size: 1024,
            })
        );
        expect(mockApi.get).toHaveBeenLastCalledWith('/submissions/judge-token?base64_encoded=true');
        expect(result.status.id).toBe(3);
    });

    test('fails closed when Judge0 omits a token', async () => {
        mockApi.post.mockResolvedValue({ data: {} });
        await expect(judgeService.executePayload({
            source_code: 'x', language_id: 71, stdin: '', expected_output: null,
        })).rejects.toThrow(/token/);
    });

    test('preserves result order while using the bounded batch executor', async () => {
        const spy = jest.spyOn(judgeService, 'executePayload')
            .mockImplementation(async (payload) => ({ marker: payload.source_code }));
        const results = await judgeService.executeBatch([
            { source_code: 'a' }, { source_code: 'b' }, { source_code: 'c' },
        ]);
        expect(results.map((result) => result.marker)).toEqual(['a', 'b', 'c']);
        spy.mockRestore();
    });

    test('returns the configured Judge0 language catalog', async () => {
        mockApi.get.mockResolvedValue({ data: [{ id: 71, name: 'Python' }] });
        await expect(judgeService.getLanguages()).resolves.toEqual([{ id: 71, name: 'Python' }]);
    });
});
