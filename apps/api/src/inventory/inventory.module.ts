import { Module } from '@nestjs/common';
import { InventoryController } from './stock-ledger.controller';
import { StockLedgerService } from './stock-ledger.service';

@Module({
  controllers: [InventoryController],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class InventoryModule {}
