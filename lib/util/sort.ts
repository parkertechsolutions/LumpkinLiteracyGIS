/**
 * Sorts by a single field, ascending or descending, nulls always last
 * regardless of direction (so reversing the sort order never buries the
 * complete rows under the incomplete ones).
 */
export function sortRows<T, K extends keyof T>(rows: T[], column: K, ascending: boolean): T[] {
  return [...rows].sort((a, b) => {
    const av = a[column];
    const bv = b[column];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return 0;
    const cmp = av! < bv! ? -1 : 1;
    return ascending ? cmp : -cmp;
  });
}
