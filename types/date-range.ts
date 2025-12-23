export interface DateRange {
  from: Date;
  to: Date;
}

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last14days'
  | 'last30days'
  | 'last90days'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

export interface DateRangePreset {
  key: PresetKey;
  label: string;
  getRange: () => DateRange;
}
