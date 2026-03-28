/**
 * Strip DynamoDB key/index attributes from a raw item, returning only domain fields.
 *
 * DynamoDB items include synthetic key attributes (PK, SK, GSI*) that are not part
 * of the domain model. This helper removes them so the result can be treated as
 * the domain type T.
 *
 * The cast to T is intentional — DynamoDB document client items are untyped Records,
 * and after stripping keys the remaining fields match T by convention of how items are stored.
 *
 * @param item - Raw DynamoDB item as a Record
 * @param keysToStrip - Array of attribute names to remove (e.g., ['PK', 'SK'])
 * @returns The item without the specified key attributes, typed as T
 */
export function stripDynamoKeys<T>(
  item: Record<string, unknown>,
  keysToStrip: readonly string[],
): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!keysToStrip.includes(key)) {
      clean[key] = value;
    }
  }
  return clean as unknown as T;
}
