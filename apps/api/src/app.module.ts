import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { PrismaExceptionFilterProvider } from './prisma/prisma-exception.filter';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, CatalogModule, InventoryModule, FinanceModule],
  providers: [PrismaExceptionFilterProvider, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
