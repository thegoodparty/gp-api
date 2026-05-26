export const PRICE_PER_TEXT_TENTH_CENTS = 35

export function calcTextAmountInCents(textCount: number): number {
  const totalTenthCents = textCount * PRICE_PER_TEXT_TENTH_CENTS
  return Math.floor((totalTenthCents + 5) / 10)
}
