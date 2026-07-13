/**
 * PostgREST caps every response at a fixed number of rows (1000 by default on
 * Supabase) regardless of any higher `.limit()`. Queries that need the full
 * result set must page through it explicitly, or they silently drop rows once
 * the table grows past the cap.
 *
 * Pass a factory that builds the query for a given row range; this pages until
 * a short page is returned and concatenates the results.
 */
const PAGE_SIZE = 1000;

/**
 * PostgREST serializes `.in()` filters into the request URL, so a filter over
 * hundreds of ids overflows the gateway's URL limit and the whole request is
 * rejected with 400 Bad Request (a ~1000-uuid list produces a ~38KB URL).
 * Any id list that grows with the data must be applied in chunks.
 */
export const IN_FILTER_CHUNK_SIZE = 200;

export function chunkForInFilter<T>(values: T[], size: number = IN_FILTER_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export async function fetchAllRows<T>(
  buildRangeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  // Hard stop well above any realistic row count so a logic error can't spin
  // forever.
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await buildRangeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
