import { TaxEngineService } from './tax-engine.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FR-4 acceptance: the two owner-confirmed examples from BUSINESS-MAPPING §5.2.
 * FILER = 0.5%, NON-FILER = 2.5% (rates seeded in M0).
 * STRICT company (GSK) charges the store; ABSORBING company (Abbott) tracks for reimbursement.
 */
describe('TaxEngineService — owner-confirmed examples', () => {
  let engine: TaxEngineService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      taxPolicyHistory: { findFirst: jest.fn() },
      taxRate: { findFirst: jest.fn() },
    };
    engine = new TaxEngineService(prisma);
  });

  const mockLookups = (policy: 'ABSORB' | 'STRICT') => {
    prisma.taxPolicyHistory.findFirst.mockResolvedValue({ companyId: 'c1', policy });
    prisma.taxRate.findFirst.mockImplementation(({ where }: any) => {
      const status = where.kind;
      return Promise.resolve({ ratePct: status === 'FILER' ? 0.5 : 2.5 });
    });
  };

  it('Example 1 — FILER store: GSK strict charges 0.50, Abbott absorbs 0.50 → store pays 200.50', async () => {
    mockLookups('STRICT');
    const gskLine = await engine.computeLine({
      lineId: 'l1',
      companyId: 'gsk',
      qty: 1,
      unitPriceKs: 100_000n, // Rs. 100.000
      customerFilerStatus: 'FILER',
      invoiceDate: new Date(),
    });
    expect(gskLine.taxChargedKs).toBe(500n); // Rs. 0.500
    expect(gskLine.taxAbsorbedKs).toBe(0n);

    mockLookups('ABSORB');
    const abbottLine = await engine.computeLine({
      lineId: 'l2',
      companyId: 'abbott',
      qty: 1,
      unitPriceKs: 100_000n,
      customerFilerStatus: 'FILER',
      invoiceDate: new Date(),
    });
    expect(abbottLine.taxChargedKs).toBe(0n);
    expect(abbottLine.taxAbsorbedKs).toBe(500n); // Rs. 0.500 → company statement

    // Store pays 100 + 0.50 (GSK tax) + 100 = 200.50
    const storeTotalKs = 100_000n + gskLine.taxChargedKs + (100_000n * BigInt(1)) + abbottLine.taxChargedKs;
    expect(storeTotalKs).toBe(200_500n);
  });

  it('Example 2 — NON-FILER store: GSK strict charges 2.50, Abbott absorbs 2.50 → store pays 202.50', async () => {
    mockLookups('STRICT');
    const gskLine = await engine.computeLine({
      lineId: 'l1',
      companyId: 'gsk',
      qty: 1,
      unitPriceKs: 100_000n,
      customerFilerStatus: 'NON_FILER',
      invoiceDate: new Date(),
    });
    expect(gskLine.taxChargedKs).toBe(2_500n); // Rs. 2.500

    mockLookups('ABSORB');
    const abbottLine = await engine.computeLine({
      lineId: 'l2',
      companyId: 'abbott',
      qty: 1,
      unitPriceKs: 100_000n,
      customerFilerStatus: 'NON_FILER',
      invoiceDate: new Date(),
    });
    expect(abbottLine.taxAbsorbedKs).toBe(2_500n);

    const storeTotalKs = 100_000n + gskLine.taxChargedKs + 100_000n + abbottLine.taxChargedKs;
    expect(storeTotalKs).toBe(202_500n);
  });

  it('throws when no rate is effective yet (no silent zero-tax)', async () => {
    prisma.taxPolicyHistory.findFirst.mockResolvedValue({ companyId: 'c1', policy: 'STRICT' });
    prisma.taxRate.findFirst.mockResolvedValue(null);
    await expect(
      engine.computeLine({
        lineId: 'l1',
        companyId: 'gsk',
        qty: 1,
        unitPriceKs: 100_000n,
        customerFilerStatus: 'FILER',
        invoiceDate: new Date('1999-01-01'),
      }),
    ).rejects.toThrow(/No tax rate/);
  });
});
