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
      unitPricePaisa: 10_000, // Rs. 100.000
      customerFilerStatus: 'FILER',
      invoiceDate: new Date(),
    });
    expect(gskLine.taxChargedPaisa).toBe(50); // Rs. 0.500
    expect(gskLine.taxAbsorbedPaisa).toBe(0);

    mockLookups('ABSORB');
    const abbottLine = await engine.computeLine({
      lineId: 'l2',
      companyId: 'abbott',
      qty: 1,
      unitPricePaisa: 10_000,
      customerFilerStatus: 'FILER',
      invoiceDate: new Date(),
    });
    expect(abbottLine.taxChargedPaisa).toBe(0);
    expect(abbottLine.taxAbsorbedPaisa).toBe(50); // Rs. 0.500 → company statement

    // Store pays 100 + 0.50 (GSK tax) + 100 = 200.50
    const storeTotalPaisa = 10_000 + gskLine.taxChargedPaisa + 10_000 + abbottLine.taxChargedPaisa;
    expect(storeTotalPaisa).toBe(20_050);
  });

  it('Example 2 — NON-FILER store: GSK strict charges 2.50, Abbott absorbs 2.50 → store pays 202.50', async () => {
    mockLookups('STRICT');
    const gskLine = await engine.computeLine({
      lineId: 'l1',
      companyId: 'gsk',
      qty: 1,
      unitPricePaisa: 10_000,
      customerFilerStatus: 'NON_FILER',
      invoiceDate: new Date(),
    });
    expect(gskLine.taxChargedPaisa).toBe(250); // Rs. 2.500

    mockLookups('ABSORB');
    const abbottLine = await engine.computeLine({
      lineId: 'l2',
      companyId: 'abbott',
      qty: 1,
      unitPricePaisa: 10_000,
      customerFilerStatus: 'NON_FILER',
      invoiceDate: new Date(),
    });
    expect(abbottLine.taxAbsorbedPaisa).toBe(250);

    const storeTotalPaisa = 10_000 + gskLine.taxChargedPaisa + 10_000 + abbottLine.taxChargedPaisa;
    expect(storeTotalPaisa).toBe(20_250);
  });

  it('throws when no rate is effective yet (no silent zero-tax)', async () => {
    prisma.taxPolicyHistory.findFirst.mockResolvedValue({ companyId: 'c1', policy: 'STRICT' });
    prisma.taxRate.findFirst.mockResolvedValue(null);
    await expect(
      engine.computeLine({
        lineId: 'l1',
        companyId: 'gsk',
        qty: 1,
        unitPricePaisa: 10_000,
        customerFilerStatus: 'FILER',
        invoiceDate: new Date('1999-01-01'),
      }),
    ).rejects.toThrow(/No tax rate/);
  });
});
