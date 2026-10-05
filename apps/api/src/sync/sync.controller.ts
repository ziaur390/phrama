import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, ParseIntPipe, ConflictException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsIn, Min, IsOptional, ValidateNested, ArrayMinSize, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncService } from './sync.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class SyncItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) qty!: number;
}

class UploadOrderDto {
  @IsString() clientRef!: string;
  @IsString() customerId!: string;
  @IsOptional() @IsString() viaCustomerId?: string;
  @IsOptional() @IsString() bookedAt?: string;
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  @ArrayMinSize(1)
  items!: SyncItemDto[];
}

class UploadRecoveryDto {
  @IsString() clientRef!: string;
  @IsString() customerId!: string;
  @IsNumber() @Min(1) amountPaisa!: number;
  @IsIn(['CASH', 'BANK']) mode!: string;
  @IsOptional() @IsString() collectedAt?: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Get('pull')
  @Roles('ADMIN', 'BOOKER', 'SALESMAN')
  pull() {
    return this.sync.pull();
  }

  @Post('orders')
  @Roles('ADMIN', 'BOOKER')
  uploadOrder(@Body() dto: UploadOrderDto, @Request() req: any) {
    return this.sync.uploadOrder(req.user.userId, dto);
  }

  @Post('recoveries')
  @Roles('ADMIN', 'BOOKER')
  uploadRecovery(@Body() dto: UploadRecoveryDto, @Request() req: any) {
    return this.sync.uploadRecovery(req.user.userId, { ...dto, mode: dto.mode as 'CASH' | 'BANK' });
  }

  @Get('orders')
  @Roles('ADMIN', 'ACCOUNTANT', 'WAREHOUSE')
  listOrders(@Query('status') status?: string) {
    return this.sync.listOrders(status as any);
  }

  @Post('orders/:id/invoice')
  @Roles('ADMIN', 'WAREHOUSE')
  invoiceOrder(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.sync.invoiceOrder(req.user.userId, id).catch((e) => {
      if (e instanceof ConflictException) throw e;
      throw e;
    });
  }
}
