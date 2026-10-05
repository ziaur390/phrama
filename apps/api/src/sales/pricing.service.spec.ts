import { bestSlabPct, bonusUnits, combinedDiscountPct, priceLine } from './pricing.service';

describe('Pricing engine (M7)', () => {
  it('base price, no discounts -> net = qty * price', () => {
    const r = priceLine({ qty: 5, unitPricePaisa: 10_000, slabDiscountPct: 0, standingDiscountPct: 0 });
    expect(r.netPaisa).toBe(50_000);
    expect(r.discountPct).toBe(0);
  });

  it('qty slab applies: buy 10+ gets 10% -> 12 x 100(Rs) = 1080 (Rs)', () => {
    const r = priceLine({ qty: 12, unitPricePaisa: 10_000, slabDiscountPct: 10, standingDiscountPct: 0 });
    expect(r.netPaisa).toBe(108_000); // Rs 1,080
    expect(r.discountPct).toBe(10);
  });

  it('standing customer discount stacks with slab, capped at 100', () => {
    expect(combinedDiscountPct(10, 5)).toBe(15);
    expect(combinedDiscountPct(90, 20)).toBe(100);
    const r = priceLine({ qty: 1, unitPricePaisa: 10_000, slabDiscountPct: 10, standingDiscountPct: 5 });
    expect(r.netPaisa).toBe(8_500); // Rs 85
  });

  it('bonus: buy 10 get 1 -> qty 12 gives 1 free, qty 20 gives 2, qty 9 gives 0', () => {
    expect(bonusUnits({ qty: 12, buyQty: 10, freeQty: 1 })).toBe(1);
    expect(bonusUnits({ qty: 20, buyQty: 10, freeQty: 1 })).toBe(2);
    expect(bonusUnits({ qty: 9, buyQty: 10, freeQty: 1 })).toBe(0);
    expect(bonusUnits({ qty: 12, buyQty: 10, freeQty: 2 })).toBe(2);
  });

  it('best slab: highest minQty <= qty wins among matching rules', () => {
    const rules = [
      { productId: null, companyId: null, minQty: 5, discountPct: 5 },    // global
      { productId: 'P1', companyId: null, minQty: 10, discountPct: 10 },  // product rule
      { productId: null, companyId: 'C1', minQty: 20, discountPct: 15 },  // company rule
    ];
    expect(bestSlabPct(rules, { productId: 'P1', companyId: 'C1', qty: 12 })).toBe(10);
    expect(bestSlabPct(rules, { productId: 'P1', companyId: 'C1', qty: 25 })).toBe(15);
    expect(bestSlabPct(rules, { productId: 'P1', companyId: 'C1', qty: 4 })).toBe(0);
    expect(bestSlabPct(rules, { productId: 'P9', companyId: 'C9', qty: 12 })).toBe(5); // global only
  });
});
