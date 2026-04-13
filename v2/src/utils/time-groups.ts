// v2/src/utils/time-groups.ts
//
// Time-grouping helper for session lists.
//
// NOTE: hermes session timestamps (started_at) are in epoch SECONDS, not ms.
// The `getTimestamp` callback is responsible for the conversion:
//   groupByTime(sessions, s => (s.started_at ?? 0) * 1000)

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface TimeGroup<T> {
  label: string
  items: T[]
}

export function groupByTime<T>(
  items: T[],
  getTimestamp: (item: T) => number,
): TimeGroup<T>[] {
  const now = Date.now()
  const todayStart = startOfDay(now)
  const yesterdayStart = startOfDay(now - 86_400_000)
  const weekStart = startOfDay(now - 7 * 86_400_000)

  const groups: TimeGroup<T>[] = [
    {
      label: 'Today',
      items: items.filter((i) => getTimestamp(i) >= todayStart),
    },
    {
      label: 'Yesterday',
      items: items.filter(
        (i) => getTimestamp(i) >= yesterdayStart && getTimestamp(i) < todayStart,
      ),
    },
    {
      label: 'This Week',
      items: items.filter(
        (i) => getTimestamp(i) >= weekStart && getTimestamp(i) < yesterdayStart,
      ),
    },
    {
      label: 'Older',
      items: items.filter((i) => getTimestamp(i) < weekStart),
    },
  ]

  // Filter out empty groups
  return groups.filter((g) => g.items.length > 0)
}
