import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  // ── companies ──
  listCompanies() {
    return this.prisma.company.findMany({ include: { taxPolicies: true }, orderBy: { code: 'asc' } });
  }

  async createCompany(dto: { code: string; name: string }) {
    return this.prisma.company.create({ data: dto });
  }

  /** Set a new tax policy from a date — history row is appended, never edited. */
  async setTaxPolicy(companyId: string, policy: 'ABSORB' | 'STRICT', effectiveFrom: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.taxPolicyHistory.create({ data: { companyId, policy, effectiveFrom: new Date(effectiveFrom) } });
      return tx.taxPolicyHistory.findFirst({
        where: { companyId },
        orderBy: { effectiveFrom: 'desc' },
      });
    });
  }

  // ── products ──
  listProducts() {
    return this.prisma.product.findMany({ include: { company: { select: { code: true, name: true } } }, orderBy: { code: 'asc' } });
  }

  async createProduct(dto: {
    code: string;
    name: string;
    companyId: string;
    pack?: string;
    salePriceKs: bigint;
    attributes?: any;
  }) {
    return this.prisma.product.create({ data: dto });
  }

  // ── customers ──
  listCustomers() {
    return this.prisma.customer.findMany({ include: { territory: true }, orderBy: { code: 'asc' } });
  }

  createCustomer(dto: {
    code: string;
    name: string;
    type?: 'REGULAR' | 'SALESMAN' | 'PREPAID';
    filerStatus?: 'FILER' | 'NON_FILER';
    creditLimitKs?: bigint;
    openingBalanceKs?: bigint;
    territoryId?: string;
    salesmanId?: string;
  }) {
    return this.prisma.customer.create({ data: dto });
  }

  /** Admin-only field per FR-4; every change gets a dated audit row. */
  async setFilerStatus(customerId: string, filerStatus: 'FILER' | 'NON_FILER', actorUserId: string, reason: string) {
    const [customer] = await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: { filerStatus } }),
      this.prisma.auditLog.create({
        data: { userId: actorUserId, action: 'SET_FILER_STATUS', entity: 'Customer', entityId: customerId, detail: { filerStatus, reason } },
      }),
    ]);
    return customer;
  }

  // ── suppliers ──
  listSuppliers() {
    return this.prisma.supplier.findMany({ include: { company: { select: { code: true, name: true } } }, orderBy: { id: 'asc' } });
  }

  createSupplier(dto: { companyId: string; openingBalanceKs?: bigint }) {
    return this.prisma.supplier.create({ data: dto });
  }

  // ── territories ──
  listTerritories() {
    return this.prisma.territory.findMany({ include: { customers: { select: { id: true, code: true, name: true } } }, orderBy: { name: 'asc' } });
  }

  createTerritory(dto: { name: string; orderDay?: number; deliveryDay?: number }) {
    return this.prisma.territory.create({ data: dto });
  }

  // ── warehouses ──
  listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  createWarehouse(dto: { name: string; kind?: 'MAIN' | 'VAN' | 'QUARANTINE' }) {
    return this.prisma.warehouse.create({ data: dto });
  }

  // ⚠️ BLOCKED ON M3: batches belong with stock ledger module (expiry drives FEFO)
}
