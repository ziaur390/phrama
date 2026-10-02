import { Controller, Body, Post, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class CreateCompanyDto {
  @IsString() code!: string;
  @IsString() name!: string;
}

class SetPolicyDto {
  @IsEnum(['ABSORB', 'STRICT']) policy!: 'ABSORB' | 'STRICT';
  @IsString() effectiveFrom!: string; // ISO date
  @IsString() reason?: string;
}

class CreateProductDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() companyId!: string;
  @IsOptional() @IsString() pack?: string;
  @IsInt() @Min(0) salePricePaisa!: number;
}

class CreateCustomerDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsEnum(['REGULAR', 'SALESMAN', 'PREPAID']) type?: string;
  @IsOptional() @IsEnum(['FILER', 'NON_FILER']) filerStatus?: string;
  @IsOptional() @IsInt() @Min(0) creditLimitPaisa?: number;
  @IsOptional() @IsInt() @Min(0) openingBalancePaisa?: number;
  @IsOptional() @IsString() territoryId?: string;
  @IsOptional() @IsString() salesmanId?: string;
}

class SetFilerStatusDto {
  @IsEnum(['FILER', 'NON_FILER']) filerStatus!: 'FILER' | 'NON_FILER';
  @IsString() reason!: string;
}

class CreateSupplierDto {
  @IsString() companyId!: string;
  @IsOptional() @IsInt() @Min(0) openingBalancePaisa?: number;
}

class CreateTerritoryDto {
  @IsString() name!: string;
  @IsOptional() @IsInt() orderDay?: number;
  @IsOptional() @IsInt() deliveryDay?: number;
}

class CreateWarehouseDto {
  @IsString() name!: string;
  @IsOptional() @IsEnum(['MAIN', 'VAN', 'QUARANTINE']) kind?: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class CatalogController {
  constructor(private catalog: CatalogService, private prisma: PrismaService) {}

  // companies
  @Get('companies')
  companies() {
    return this.catalog.listCompanies();
  }

  @Post('companies')
  @Roles('ADMIN', 'ACCOUNTANT')
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.catalog.createCompany(dto);
  }

  @Post('companies/:id/tax-policy')
  @Roles('ADMIN')
  setTaxPolicy(@Param('id') id: string, @Body() dto: SetPolicyDto) {
    return this.catalog.setTaxPolicy(id, dto.policy, dto.effectiveFrom);
  }

  // products
  @Get('products')
  products() {
    return this.catalog.listProducts();
  }

  @Post('products')
  @Roles('ADMIN', 'ACCOUNTANT')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  // customers
  @Get('customers')
  customers() {
    return this.catalog.listCustomers();
  }

  @Post('customers')
  @Roles('ADMIN', 'ACCOUNTANT')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.catalog.createCustomer({
      ...dto,
      type: dto.type as any,
      filerStatus: dto.filerStatus as any,
      creditLimitPaisa: dto.creditLimitPaisa,
      openingBalancePaisa: dto.openingBalancePaisa,
    });
  }

  @Post('customers/:id/filer-status')
  @Roles('ADMIN')
  async setFilerStatus(@Param('id') id: string, @Body() dto: SetFilerStatusDto) {
    return this.catalog.setFilerStatus(id, dto.filerStatus, "system-admin", dto.reason);
  }

  // suppliers
  @Get('suppliers')
  suppliers() {
    return this.catalog.listSuppliers();
  }

  @Post('suppliers')
  @Roles('ADMIN', 'ACCOUNTANT')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.catalog.createSupplier({
      companyId: dto.companyId,
      openingBalancePaisa: dto.openingBalancePaisa,
    });
  }

  // territories
  @Get('territories')
  territories() {
    return this.catalog.listTerritories();
  }

  @Post('territories')
  @Roles('ADMIN', 'ACCOUNTANT')
  createTerritory(@Body() dto: CreateTerritoryDto) {
    return this.catalog.createTerritory(dto);
  }

  // warehouses
  @Get('warehouses')
  warehouses() {
    return this.catalog.listWarehouses();
  }

  @Post('warehouses')
  @Roles('ADMIN')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.catalog.createWarehouse(dto as any);
  }
}
