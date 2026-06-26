import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenantState {
  tenantId: string;
  userId: string;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantState>();

  run<T>(state: TenantState, fn: () => T): T {
    return this.storage.run(state, fn);
  }

  get(): TenantState {
    const state = this.storage.getStore();
    if (!state) {
      throw new Error('Tenant context is not initialised for the current execution');
    }
    return state;
  }

  tryGet(): TenantState | undefined {
    return this.storage.getStore();
  }
}
