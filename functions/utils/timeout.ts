// Wrap a promise with a hard timeout. Used for Slack Web API calls which
// otherwise have no built-in deadline and can sit queued during a Slack
// outage for extended periods.

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);
}

// Sane defaults for the various Slack calls this app makes.
export const SLACK_TIMEOUTS = {
  postMessage: 15_000,
  postEphemeral: 15_000,
  usersInfo: 10_000,
  conversationsInfo: 10_000,
  conversationsHistory: 15_000,
  chatGetPermalink: 10_000,
  datastorePut: 10_000,
  datastoreGet: 10_000,
};
