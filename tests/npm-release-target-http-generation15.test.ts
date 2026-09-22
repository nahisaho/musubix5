import { describe, expect, it } from 'vitest';

describe('npm release target HTTP generation 15', () => {
  /**
   * @id TEST-M5-RELEASE-004-TARGET-HTTP-001
   * @verifies REQ-M5-RELEASE-004
   */
  it('TEST-M5-RELEASE-004-TARGET-HTTP-001 parses stable Release metadata after response headers', async () => {
    const { parseReleaseTargetApiResponse } =
      await import('../packages/analysis/src/release-workflow.js');
    const parsed = parseReleaseTargetApiResponse(
      'HTTP/2 200 OK\ncontent-type: application/json\n\n'
      + '{"tag_name":"v0.1.1","draft":false,"prerelease":false}\n',
    );
    expect(parsed).toEqual({
      statusCode: 200,
      body: {
        tag_name: 'v0.1.1',
        draft: false,
        prerelease: false,
      },
    });
  });
});
