import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';
import { ProcurementModule } from './procurement/procurement.module';
import { SalesModule } from './sales/sales.module';
import { ClaimsModule } from './claims/claims.module';
import { ReportsModule } from './reports/reports.module';
import { SyncModule } from './sync/sync.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { PrismaExceptionFilterProvider } from './prisma/prisma-exception.filter';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, CatalogModule, InventoryModule, FinanceModule, ProcurementModule, SalesModule, ClaimsModule, ReportsModule, SyncModule],
  providers: [PrismaExceptionFilterProvider, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
