import { Controller, Post, Body, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';

export class CreateUserDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() fullName!: string;
  @IsString() role!: string;
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService, private prisma: PrismaService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  list() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, active: true, createdAt: true },
      orderBy: { username: 'asc' },
    });
  }

  @Get(':id')
  @Roles('ADMIN')
  async get(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, fullName: true, role: true, active: true, createdAt: true },
    });
    if (!u) throw new NotFoundException();
    return u;
  }
}
