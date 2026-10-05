/**
 * M7 pricing engine — layers applied in the legacy order:
 *   base price -> company scheme / qty slab (DiscountRule) -> customer terms
 *   (standing discount) -> bonus (buy N get M = separate FOC lines, zero price/tax).
 * Pure math + rule inputs; no DB here (rules are loaded by the sales service).
 */

export interface PriceInput {
  qty: number;
  unitPricePaisa: number;
  slabDiscountPct: number; // best matching DiscountRule (0 if none)
  standingDiscountPct: number; // customer terms
}

export interface PriceResult {
  qty: number; // billed qty (promised qty; bonus added separately)
  unitPricePaisa: number;
  discountPct: number; // combined, capped at 100
  netPaisa: number; // qty * price after discount
}

export interface BonusInput {
  qty: number;
  buyQty: number;
  freeQty: number;
}

/** Combined discount pct, additive, capped at 100. */
export function combinedDiscountPct(slabPct: number, standingPct: number): number {
  return Math.min(100, Math.max(0, slabPct) + Math.max(0, standingPct));
}

/** net = round(qty * price * (1 - pct/100)) — half-up to whole paisa. */
export function priceLine(input: PriceInput): PriceResult {
  const pct = combinedDiscountPct(input.slabDiscountPct, input.standingDiscountPct);
  const raw = input.qty * input.unitPricePaisa * (1 - pct / 100);
  return {
    qty: input.qty,
    unitPricePaisa: input.unitPricePaisa,
    discountPct: pct,
    netPaisa: Math.round(raw),
  };
}

/** Bonus: freeQty per complete buyQty group. buy 10 get 1, qty 12 -> 1 free. */
export function bonusUnits(input: BonusInput): number {
  if (input.buyQty <= 0 || input.freeQty <= 0) return 0;
  return Math.floor(input.qty / input.buyQty) * input.freeQty;
}

/**
 * Best slab: the matching rule with the highest minQty <= qty wins.
 * Match by exact productId, else companyId, else global (both null).
 */
export function bestSlabPct(
  rules: { productId: string | null; companyId: string | null; minQty: number; discountPct: number }[],
  ctx: { productId: string; companyId: string; qty: number },
): number {
  const matching = rules
    .filter((r) => (r.productId === ctx.productId || r.companyId === ctx.companyId || (!r.productId && !r.companyId)))
    .filter((r) => r.minQty <= ctx.qty)
    .sort((a, b) => b.minQty - a.minQty);
  return matching[0]?.discountPct ?? 0;
}
