import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { username: string; password: string; fullName: string; role: string }) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('Username taken');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { username: dto.username, passwordHash, fullName: dto.fullName, role: dto.role as any },
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, detail: { role: dto.role, createdBy: 'admin-endpoint' } },
    });
    return user;
  }
}
