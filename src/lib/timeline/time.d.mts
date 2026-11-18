export interface NormalizedTimelineTime {
  label?: string;
  year?: number;
  startYear?: number;
  endYear?: number;
  precision?: string;
  [key: string]: unknown;
}
export function normalizeTime(value: unknown): NormalizedTimelineTime | null;
export function timeLabel(value: unknown): string;
export function timelineSortValue(value: unknown): number;
