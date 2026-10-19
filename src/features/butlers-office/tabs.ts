/** The Butler's Office sections, in order; `?tab=` deep links use these. */
export const OFFICE_TABS = [
  'overview',
  'correspondence',
  'requests',
  'privileges',
  'redemptions',
  'messages',
  'vault',
  'history',
  'membership',
] as const;
export type OfficeTab = (typeof OFFICE_TABS)[number];
