export { PersistenceAdapter, BasePersistenceAdapter } from './persistence-adapter';
export { RedisAdapter, RedisAdapterConfig } from './redis-adapter';
export { SqliteAdapter, SqliteAdapterConfig } from './sqlite-adapter';

import { PersistenceAdapter } from './persistence-adapter';
import { RedisAdapter, RedisAdapterConfig } from './redis-adapter';
import { SqliteAdapter, SqliteAdapterConfig } from './sqlite-adapter';
import { PersistenceType } from '../../enums';

// Re-export for backward compatibility
export { PersistenceType };

export interface PersistenceConfig {
  type: PersistenceType;
  redis?: RedisAdapterConfig;
  sqlite?: SqliteAdapterConfig;
}

export class PersistenceFactory {
  static create(config: PersistenceConfig): PersistenceAdapter {
    switch (config.type) {
      case PersistenceType.REDIS:
        return new RedisAdapter(config.redis);

      case PersistenceType.SQLITE:
        return new SqliteAdapter(config.sqlite);

      case PersistenceType.MEMORY:
        return new SqliteAdapter({
          ...config.sqlite,
          inMemory: true
        });

      default:
        throw new Error(`Unknown persistence type: ${config.type}`);
    }
  }
}