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
  AMOUNT_OFF_PURCHASE = 'AMOUNT_OFF_PURCHASE',
  NO_DISCOUNT = 'NO_DISCOUNT',
  FREE = 'FREE',
}
