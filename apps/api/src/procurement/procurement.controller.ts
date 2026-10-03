import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsOptional, IsEnum, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ProcurementService } from './procurement.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class POLineDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) orderedQty!: number;
  @IsInt() @Min(0) unitCostPaisa!: number;
}

class CreatePODto {
  @IsString() supplierId!: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsString() memo?: string;
  @ValidateNested({ each: true })
  @Type(() => POLineDto)
  @ArrayMinSize(1)
  lines!: POLineDto[];
}

class ReceiptLineDto {
  @IsString() productId!: string;
  @IsString() batchNo!: string;
  @IsString() expiry!: string;
  @IsInt() @Min(1) receivedQty!: number;
  @IsInt() @Min(0) unitCostPaisa!: number;
}

class CreateReceiptDto {
  @IsInt() poId!: number;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() memo?: string;
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  @ArrayMinSize(1)
  lines!: ReceiptLineDto[];
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private procurement: ProcurementService) {}

  @Post('purchase-orders')
  @Roles('ADMIN', 'ACCOUNTANT')
  createPO(@Body() dto: CreatePODto, @Request() req: any) {
    return this.procurement.createPO(req.user.userId, dto);
  }

  @Get('purchase-orders')
  listPOs(@Query('status') status?: string) {
    return this.procurement.listPOs(status as any);
  }

  @Get('purchase-orders/:id')
  getPO(@Param('id', ParseIntPipe) id: number) {
    return this.procurement.getPO(id);
  }

  @Post('stock-receipts')
  @Roles('ADMIN', 'WAREHOUSE')
  createReceipt(@Body() dto: CreateReceiptDto, @Request() req: any) {
    return this.procurement.createReceipt(req.user.userId, dto);
  }

  @Get('stock-receipts')
  listReceipts(@Query('poId') poId?: string) {
    return this.procurement.listReceipts(poId ? Number(poId) : undefined);
  }
}
