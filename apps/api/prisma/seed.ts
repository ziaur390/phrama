import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('phrama123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: hash, fullName: 'System Admin', role: 'ADMIN' },
  });
  await prisma.warehouse.upsert({
    where: { name: 'Main Warehouse' },
    update: {},
    create: { name: 'Main Warehouse', kind: 'MAIN' },
  });
  await prisma.warehouse.upsert({
    where: { name: 'Quarantine' },
    update: {},
    create: { name: 'Quarantine', kind: 'QUARANTINE' },
  });
  // Date-effective tax rates (BUSINESS-MAPPING §5.2: FILER 0.5%, NON-FILER 2.5%)
  const epoch = new Date('2000-01-01');
  await prisma.taxRate.upsert({
    where: { id: 'rate-filer-base' },
    update: {},
    create: { id: 'rate-filer-base', kind: 'FILER', ratePct: 0.5, effectiveFrom: epoch },
  });
  await prisma.taxRate.upsert({
    where: { id: 'rate-nonfiler-base' },
    update: {},
    create: { id: 'rate-nonfiler-base', kind: 'NON_FILER', ratePct: 2.5, effectiveFrom: epoch },
  });
  console.log('Seed done: admin/phrama123, Main Warehouse + Quarantine, base tax rates');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
