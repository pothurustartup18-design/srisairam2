/**
 * Retry an async operation a few times with a short linear backoff.
 *
 * Scope: ONLY for finishing a database write that must complete after an
 * external side effect (e.g. a WhatsApp send) has ALREADY irreversibly
 * succeeded — a transient MongoDB connection blip is usually gone within a
 * second or two, and retrying a few times gives the write a fair chance
 * without introducing any queue/outbox infrastructure. Never use this to
 * retry the external call itself (whatsapp.service's `dispatch()` already has
 * its own retry policy for that, and retrying a WhatsApp send here would risk
 * sending the same message twice).
 */
export async function retryDbWrite<T>(fn: () => Promise<T>, attempts = 3, delayMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}
