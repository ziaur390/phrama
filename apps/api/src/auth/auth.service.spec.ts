import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

const adminUser = {
  id: 'u1',
  username: 'admin',
  passwordHash: '', // set fresh in beforeAll — baked-in hashes rot
  fullName: 'Admin',
  role: 'ADMIN',
  active: true,
  createdAt: new Date(),
  auditLogs: [],
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: { signAsync: jest.Mock };

  beforeAll(async () => {
    adminUser.passwordHash = await bcrypt.hash('phrama123', 4);
  });

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = { signAsync: jest.fn().mockResolvedValue('token-123') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns a token for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    const res = await service.login('admin', 'phrama123');
    expect(res.accessToken).toBe('token-123');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', username: 'admin', role: 'ADMIN' });
  });

  it('rejects unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('ghost', 'x')).rejects.toThrow('Invalid credentials');
  });

  it('rejects wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(adminUser);
    await expect(service.login('admin', 'wrongpass')).rejects.toThrow('Invalid credentials');
  });

  it('rejects inactive user', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...adminUser, active: false });
    await expect(service.login('admin', 'phrama123')).rejects.toThrow('Invalid credentials');
  });
});
