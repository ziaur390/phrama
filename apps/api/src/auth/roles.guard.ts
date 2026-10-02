import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export type RoleName = 'ADMIN' | 'ACCOUNTANT' | 'WAREHOUSE' | 'BOOKER' | 'SALESMAN' | 'COUNTER';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}

  canActivate(context: any): boolean {
    // GLOBAL guard order: JwtAuthGuard runs first (APP_GUARD #1), so req.user exists when we see @Roles.
    // Controllers additionally use AuthGuard('jwt') + RolesGuard via UseGuards below APP_GUARD registration.
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return required.includes(user?.role);
  }
}
