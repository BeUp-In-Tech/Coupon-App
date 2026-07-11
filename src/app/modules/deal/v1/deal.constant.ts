export const excludeField = [
  'searchTerm',
  'sort',
  'page',
  'limit',
  'fields',
  'join',
  'nearby',
  'category',
  'deal_filter'
];

export enum DealDiscountType {
  PERCENT_OFF_PRICE = 'PERCENT_OFF_PRICE',
  PERCENT_OFF_TOTAL = 'PERCENT_OFF_TOTAL',
  FIXED_PRICE = 'FIXED_PRICE',
  CUSTOM_DISCOUNT = 'CUSTOM_DISCOUNT',
  NO_PRICE = 'NO_PRICE',
}
