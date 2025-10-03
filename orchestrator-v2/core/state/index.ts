export * from './types';
export { EventDrivenStateManager, StateManagerConfig } from './event-driven-state-manager';
export { EventBus, EventBusConfig } from './events/event-bus';
export {
  PersistenceAdapter,
  PersistenceFactory,
  PersistenceConfig,
  PersistenceType,
  RedisAdapter,
  SqliteAdapter
} from './persistence';
export { StateMigrator, MigrationConfig, MigrationResult } from './migration/state-migrator';

import { EventDrivenStateManager, StateManagerConfig } from './event-driven-state-manager';
import { PersistenceFactory, PersistenceConfig } from './persistence';
import { StateMigrator, MigrationConfig } from './migration/state-migrator';
import winston from 'winston';

export interface OrchestratorConfig {
  state?: StateManagerConfig;
  persistence?: PersistenceConfig;
  migration?: MigrationConfig;
  enableLogging?: boolean;
}

export class OrchestratorStateSystem {
  private stateManager: EventDrivenStateManager;
  private logger: winston.Logger;

  constructor(config: OrchestratorConfig = {}) {
    this.stateManager = new EventDrivenStateManager(config.state);

    this.logger = winston.createLogger({
      level: config.enableLogging ? 'info' : 'error',
      format: winston.format.json(),
      defaultMeta: { service: 'OrchestratorStateSystem' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    if (config.persistence) {
      this.initializePersistence(config.persistence);
    }
  }

  private async initializePersistence(config: PersistenceConfig): Promise<void> {
    const adapter = PersistenceFactory.create(config);
    await adapter.connect();
    this.logger.info(`Initialized ${config.type} persistence`);
  }

  async migrateFromLegacy(config: MigrationConfig): Promise<void> {
    const migrator = new StateMigrator(this.stateManager, config);
    const result = await migrator.migrate();

    if (!result.success) {
      throw new Error(`Migration failed with ${result.errors.length} errors`);
    }

    this.logger.info('Migration completed successfully', {
      workflowsMigrated: result.workflowsMigrated,
      tasksMigrated: result.tasksMigrated,
      agentsMigrated: result.agentsMigrated
    });
  }

  getStateManager(): EventDrivenStateManager {
    return this.stateManager;
  }

  async shutdown(): Promise<void> {
    await this.stateManager.destroy();
    this.logger.info('State system shut down');
  }
}