export function selectRefreshableAiQueries<T>(queries: readonly T[], enabled: readonly boolean[]) {
  return queries.filter((_, index) => enabled[index] === true);
}
