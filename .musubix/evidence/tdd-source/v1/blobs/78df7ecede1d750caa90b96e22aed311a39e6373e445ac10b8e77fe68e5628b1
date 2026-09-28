import { describe, expect, it } from 'vitest';

describe('release target HTTP generation 15', () => {
  /**
   * @id TEST-M5-RELEASE-003-TARGET-HTTP-001
   * @verifies REQ-M5-RELEASE-003
   */
  it('TEST-M5-RELEASE-003-TARGET-HTTP-001 parses the final machine-readable HTTP response', async () => {
    const { parseReleaseTargetApiResponse } =
      await import('../packages/analysis/src/release-workflow.js');
    const parsed = parseReleaseTargetApiResponse(
      'HTTP/1.1 200 Connection established\r\n\r\n'
      + 'HTTP/2 404 Not Found\r\ncontent-type: application/json\r\n\r\n'
      + '{"message":"Not Found"}\n',
    );
    expect(parsed).toEqual({
      statusCode: 404,
      body: { message: 'Not Found' },
    });
  });
});
