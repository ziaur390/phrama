import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsOptional, IsEnum, Min, Max, ValidateNested, ArrayMinSize, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { voucherNumber } from '../finance/finance.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class InvoiceItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
}

class CreateInvoiceDto {
  @IsString() customerId!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsIn(['FRESH', 'COUNTER']) channel?: string;
  @IsOptional() @IsString() memo?: string;
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @ArrayMinSize(1)
  items!: InvoiceItemDto[];
}

class VoidDto {
  @IsString() reason!: string;
}

class DiscountRuleDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsInt() @Min(1) minQty!: number;
  @IsInt() @Min(1) @Max(100) discountPct!: number;
}

class BonusRuleDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) buyQty!: number;
  @IsInt() @Min(1) freeQty!: number;
}

class NoteDto {
  @IsString() customerId!: string;
  @IsInt() @Min(1) amountPaisa!: number;
  @IsString() memo!: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private sales: SalesService, private prisma: PrismaService) {}

  @Post('invoices')
  @Roles('ADMIN', 'ACCOUNTANT', 'WAREHOUSE')
  post(@Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.sales.postInvoice(req.user.userId, dto as any);
  }

  @Get('invoices')
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.sales.listInvoices({ customerId, status: status as any });
  }

  @Get('invoices/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.sales.getInvoice(id);
  }

  @Post('invoices/:id/void')
  @Roles('ADMIN', 'ACCOUNTANT')
  void(@Param('id', ParseIntPipe) id: number, @Body() dto: VoidDto, @Request() req: any) {
    return this.sales.voidInvoice(req.user.userId, id, dto.reason);
  }

  // pricing masters
  @Post('discount-rules')
  @Roles('ADMIN', 'ACCOUNTANT')
  createDiscountRule(@Body() dto: DiscountRuleDto) {
    return this.prisma.discountRule.create({ data: dto });
  }

  @Get('discount-rules')
  listDiscountRules() {
    return this.prisma.discountRule.findMany({ orderBy: { minQty: 'asc' } });
  }

  @Post('bonus-rules')
  @Roles('ADMIN', 'ACCOUNTANT')
  createBonusRule(@Body() dto: BonusRuleDto) {
    return this.prisma.bonusRule.create({ data: dto });
  }

  @Get('bonus-rules')
  listBonusRules() {
    return this.prisma.bonusRule.findMany();
  }

  // corrections as finance vouchers
  @Post('credit-notes')
  @Roles('ADMIN', 'ACCOUNTANT')
  async creditNote(@Body() dto: NoteDto) {
    const v = await this.prisma.$transaction((tx) =>
      // CN reduces what the store owes: Dr SALES / Cr AR
      this.prisma.voucher.create({
        data: {
          kind: 'CREDIT_NOTE',
          memo: dto.memo,
          lines: {
            create: [
              { account: 'SALES', debitPaisa: dto.amountPaisa },
              { account: 'AR', creditPaisa: dto.amountPaisa, customerId: dto.customerId },
            ],
          },
        },
      }),
    );
    return { ...v, number: voucherNumber(v.kind, v.id) };
  }

  @Post('debit-notes')
  @Roles('ADMIN', 'ACCOUNTANT')
  async debitNote(@Body() dto: NoteDto) {
    const v = await this.prisma.voucher.create({
      data: {
        kind: 'DEBIT_NOTE',
        memo: dto.memo,
        lines: {
          create: [
            { account: 'AR', debitPaisa: dto.amountPaisa, customerId: dto.customerId },
            { account: 'SALES', creditPaisa: dto.amountPaisa },
          ],
        },
      },
    });
    return { ...v, number: voucherNumber(v.kind, v.id) };
  }
}
