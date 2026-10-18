export function messagePage<T extends { id: string }>(newestFirst: T[], pageSize = 50) {
  const nextBeforeId = newestFirst.length === pageSize
    ? newestFirst[newestFirst.length - 1]?.id ?? null
    : null;
  return { data: newestFirst.reverse(), nextBeforeId };
}
