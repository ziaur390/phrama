import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [FinanceModule],
  controllers: [SalesController],
  providers: [SalesService, TaxEngineService],
})
export class SalesModule {}
