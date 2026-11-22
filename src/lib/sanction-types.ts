export const SANCTION_TYPES = ['sexual', 'harass', 'attend', 'secret', 'fraud', 'embezzle', 'neglect', 'drunk', 'dignity'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];
