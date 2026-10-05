import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { SalesModule } from '../sales/sales.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [FinanceModule, SalesModule, InventoryModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
