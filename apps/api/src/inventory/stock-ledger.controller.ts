import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsOptional, ArrayMinSize, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { StockLedgerService } from './stock-ledger.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class StockLineDto {
  @IsString() productId!: string;
  @IsString() batchId!: string;
  @IsInt() qty!: number;
}

class AdjustLineDto {
  @IsString() productId!: string;
  @IsString() batchId!: string;
  @IsInt() delta!: number;
}

class OpeningDto {
  @IsString() warehouseId!: string;
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  @ArrayMinSize(1)
  lines!: StockLineDto[];
}

class TransferDto {
  @IsString() fromWarehouseId!: string;
  @IsString() toWarehouseId!: string;
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  @ArrayMinSize(1)
  lines!: StockLineDto[];
}

class AdjustDto {
  @IsString() warehouseId!: string;
  @IsString() @IsNotEmpty() reason!: string;
  @ValidateNested({ each: true })
  @Type(() => AdjustLineDto)
  @ArrayMinSize(1)
  lines!: AdjustLineDto[];
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private ledger: StockLedgerService) {}

  @Get('stock')
  stock(@Query('productId') productId?: string, @Query('batchId') batchId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.ledger.currentStock({ productId, batchId, warehouseId });
  }

  @Get('movements')
  movements(@Query('productId') productId?: string, @Query('batchId') batchId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.ledger.movementHistory({ productId, batchId, warehouseId });
  }

  @Post('opening')
  @Roles('ADMIN', 'WAREHOUSE')
  opening(@Body() dto: OpeningDto, @Request() req: any) {
    return this.ledger.postOpening(req.user.userId, dto.warehouseId, dto.lines);
  }

  @Post('transfers')
  @Roles('ADMIN', 'WAREHOUSE')
  transfer(@Body() dto: TransferDto, @Request() req: any) {
    return this.ledger.postTransfer(req.user.userId, dto.fromWarehouseId, dto.toWarehouseId, dto.lines);
  }

  @Post('adjustments')
  @Roles('ADMIN', 'WAREHOUSE')
  adjustment(@Body() dto: AdjustDto, @Request() req: any) {
    return this.ledger.postAdjustment(req.user.userId, dto.warehouseId, dto.reason, dto.lines);
  }
}
