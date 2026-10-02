import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsOptional, IsEnum, IsIn, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceService, JournalLineInput } from './finance.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class VoucherDto {
  @IsEnum(['CASH_RECEIPT', 'BANK_RECEIPT', 'CASH_PAYMENT', 'BANK_PAYMENT', 'EXPENSE', 'JOURNAL'])
  kind!: string;

  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() memo?: string;

  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() supplierId?: string;

  @IsOptional() @IsIn(['CASH', 'BANK']) paidFrom?: string;

  @IsOptional() @IsInt() @Min(1) amountPaisa?: number;

  @IsOptional() @ValidateNested({ each: true })
  @Type(() => LineDto)
  @ArrayMinSize(2)
  lines?: LineDto[];
}

class LineDto implements JournalLineInput {
  @IsEnum(['CASH', 'BANK', 'AR', 'AP', 'SALES', 'SALES_RETURN', 'TAX_CHARGED', 'TAX_ABSORBED', 'INVENTORY', 'EXPENSE', 'OPENING_EQUITY'])
  account!: any;
  @IsOptional() @IsInt() @Min(1) debitPaisa?: number;
  @IsOptional() @IsInt() @Min(1) creditPaisa?: number;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() memo?: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Post('vouchers')
  @Roles('ADMIN', 'ACCOUNTANT')
  post(@Body() dto: VoucherDto, @Request() req: any) {
    return this.finance.postVoucher(req.user.userId, dto as any);
  }

  @Get('vouchers')
  @Roles('ADMIN', 'ACCOUNTANT')
  list(@Query('kind') kind?: string, @Query('customerId') customerId?: string, @Query('supplierId') supplierId?: string) {
    return this.finance.listVouchers({ kind: kind as any, customerId, supplierId });
  }

  @Get('customers/:id/ledger')
  @Roles('ADMIN', 'ACCOUNTANT', 'BOOKER')
  customerLedger(@Param('id') id: string) {
    return this.finance.customerLedger(id);
  }

  @Get('suppliers/:id/ledger')
  @Roles('ADMIN', 'ACCOUNTANT')
  supplierLedger(@Param('id') id: string) {
    return this.finance.supplierLedger(id);
  }

  @Get('cash-book')
  @Roles('ADMIN', 'ACCOUNTANT')
  cashBook() {
    return this.finance.cashBook();
  }
}
