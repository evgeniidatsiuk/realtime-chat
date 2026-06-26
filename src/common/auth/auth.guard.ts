import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/configuration';

export const TENANT_HEADER = 'x-tenant-id';
export const AUTH_HEADER = 'authorization';

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = this.authenticate(request);
    request.principal = principal;
    return true;
  }

  private authenticate(request: FastifyRequest): AuthenticatedPrincipal {
    const authHeader = request.headers[AUTH_HEADER];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const tokens = this.config.get('auth', { infer: true }).tokens;
    const tenantId = tokens.get(token);
    if (!tenantId) {
      throw new UnauthorizedException('Invalid API token');
    }

    const headerTenant = request.headers[TENANT_HEADER];
    if (typeof headerTenant === 'string' && headerTenant.trim() && headerTenant !== tenantId) {
      throw new UnauthorizedException('Token does not belong to the requested tenant');
    }

    return { userId: `user:${tenantId}`, tenantId };
  }
}
