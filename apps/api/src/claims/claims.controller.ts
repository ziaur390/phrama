import { Controller, Post, Get, Body, Param, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsInt, IsIn, Min, IsOptional, IsNotEmpty } from 'class-validator';
import { ClaimsService } from './claims.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class StatementClaimDto {
  @IsString() companyId!: string;
  @IsString() from!: string; // ISO date
  @IsString() to!: string;
  @IsOptional() @IsString() memo?: string;
}

class ExpiryClaimDto {
  @IsString() companyId!: string;
  @IsString() batchId!: string;
  @IsInt() @Min(1) qty!: number;
}

class ReceiveDto {
  @IsInt() @Min(1) amountPaisa!: number;
  @IsIn(['CASH', 'BANK']) mode!: string;
}

class WriteOffDto {
  @IsString() batchId!: string;
  @IsString() warehouseId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsString() @IsNotEmpty() reason!: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private claims: ClaimsService) {}

  @Get('statement')
  @Roles('ADMIN', 'ACCOUNTANT')
  statement(@Query('companyId') companyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.claims.taxStatement(companyId, from, to);
  }

  @Post('tax-absorbed')
  @Roles('ADMIN', 'ACCOUNTANT')
  claimStatement(@Body() dto: StatementClaimDto, @Request() req: any) {
    return this.claims.claimFromStatement(req.user.userId, dto.companyId, dto.from, dto.to, dto.memo);
  }

  @Post('expiry')
  @Roles('ADMIN', 'ACCOUNTANT', 'WAREHOUSE')
  claimExpiry(@Body() dto: ExpiryClaimDto, @Request() req: any) {
    return this.claims.claimExpiry(req.user.userId, dto.companyId, dto.batchId, dto.qty);
  }

  @Get()
  list(@Query('companyId') companyId?: string, @Query('status') status?: string) {
    return this.claims.listClaims({ companyId, status: status as any });
  }

  @Post(':id/send')
  @Roles('ADMIN', 'ACCOUNTANT')
  send(@Param('id', ParseIntPipe) id: number) {
    return this.claims.sendClaim(id);
  }

  @Post(':id/receive')
  @Roles('ADMIN', 'ACCOUNTANT')
  receive(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveDto, @Request() req: any) {
    return this.claims.receiveClaim(req.user.userId, id, dto.amountPaisa, dto.mode as 'CASH' | 'BANK');
  }

  @Post('write-off')
  @Roles('ADMIN', 'ACCOUNTANT', 'WAREHOUSE')
  writeOff(@Body() dto: WriteOffDto, @Request() req: any) {
    return this.claims.writeOff(req.user.userId, dto.batchId, dto.warehouseId, dto.qty, dto.reason);
  }
}
