const axios = require('axios');
const {
  JUDGE0_URL,
  JUDGE0_AUTH_TOKEN,
  JUDGE0_TIMEOUT_MS,
  JUDGE0_POLL_INTERVAL_MS,
  JUDGE0_CONCURRENCY,
} = require('../config/env');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encode(value) {
  return Buffer.from(value == null ? '' : String(value)).toString('base64');
}

class JudgeService {
  constructor() {
    const headers = { 'Content-Type': 'application/json' };
    if (JUDGE0_AUTH_TOKEN) headers['X-Auth-Token'] = JUDGE0_AUTH_TOKEN;
    this.api = axios.create({ baseURL: JUDGE0_URL, headers, timeout: JUDGE0_TIMEOUT_MS });
  }

  async poll(token) {
    const deadline = Date.now() + JUDGE0_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.api.get(`/submissions/${encodeURIComponent(token)}?base64_encoded=true`);
      if (Number(response.data?.status?.id) > 2) return response.data;
      await sleep(JUDGE0_POLL_INTERVAL_MS);
    }
    const error = new Error('Judge0 evaluation timed out');
    error.code = 'JUDGE_TIMEOUT';
    throw error;
  }

  async executePayload(submission) {
    const payload = {
      source_code: encode(submission.source_code),
      language_id: submission.language_id,
      stdin: encode(submission.stdin),
      ...(submission.expected_output == null ? {} : { expected_output: encode(submission.expected_output) }),
      ...(submission.cpu_time_limit == null ? {} : { cpu_time_limit: submission.cpu_time_limit }),
      ...(submission.memory_limit == null ? {} : { memory_limit: submission.memory_limit }),
      wall_time_limit: Math.max(2, Number(submission.cpu_time_limit || 2) * 2),
      max_file_size: 1024,
    };
    const response = await this.api.post('/submissions?base64_encoded=true&wait=false', payload);
    if (!response.data?.token) throw new Error('Judge0 did not return an evaluation token');
    return this.poll(response.data.token);
  }

  // Compatibility wrapper used by the custom-run controller/tests.
  async execute(sourceCode, languageId, stdin, expectedOutput, limits = {}) {
    return this.executePayload({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
      expected_output: expectedOutput,
      ...limits,
    });
  }

  async executeBatch(submissions) {
    const results = new Array(submissions.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < submissions.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await this.executePayload(submissions[index]);
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(JUDGE0_CONCURRENCY, submissions.length) },
      () => worker()
    ));
    return results;
  }

  async getLanguages() {
    const response = await this.api.get('/languages');
    return response.data;
  }
}

module.exports = new JudgeService();
