/**
 * "Latest request wins". Starting a new load invalidates every earlier one, so a slow response for an old scope or filter can
 * never overwrite the figures for the current one (figures from the wrong scope would look current, which is worse than a
 * spinner). Plain objects, no React: one instance per data source, kept in a ref.
 */
export interface Latest {
  /** Marks a new request as the current one and returns a function that says whether it still is. */
  begin(): () => boolean;
}

export function createLatest(): Latest {
  let seq = 0;
  return {
    begin() {
      const mine = ++seq;
      return () => mine === seq;
    },
  };
}
