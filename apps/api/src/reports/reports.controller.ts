import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('dashboard')
  @Roles('ADMIN')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('sales-by-product')
  @Roles('ADMIN', 'ACCOUNTANT')
  salesByProduct(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.salesByDay(from, to);
  }

  @Get('dsr')
  @Roles('ADMIN', 'ACCOUNTANT')
  dsr(@Query('date') date?: string) {
    return this.reports.dsr(date);
  }

  @Get('customer-statement')
  @Roles('ADMIN', 'ACCOUNTANT', 'BOOKER')
  customerStatement(@Query('customerId') customerId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.customerStatement(customerId, from, to);
  }

  @Get('stock-valuation')
  @Roles('ADMIN', 'ACCOUNTANT')
  stockValuation(@Query('warehouseId') warehouseId?: string) {
    return this.reports.stockValuation(warehouseId);
  }
}
