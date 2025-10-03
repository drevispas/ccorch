import {
  AgentPlugin,
  AgentContext,
  AgentResult,
  PluginManifest,
  ComplexityLevel,
  AgentDefinition,
  AgentCapability
} from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export abstract class BaseAgentPlugin implements AgentPlugin {
  public manifest: PluginManifest;
  private _metadata: PluginManifest;
  private _isInitialized: boolean = false;
  protected config: any;
  private initializationPromise?: Promise<void>;
  protected validationSchema?: any;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
    this._metadata = Object.freeze({ ...manifest });
  }

  // Read-only metadata getter
  get metadata(): PluginManifest {
    return this._metadata;
  }

  setValidationSchema(schema: any): void {
    this.validationSchema = schema;
  }

  // Property getter that returns initialization state
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  async initialize(config?: any): Promise<void> {
    // Prevent concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this._isInitialized) {
      return;
    }

    this.initializationPromise = this.doInitialize(config);
    try {
      await this.initializationPromise;
      this._isInitialized = true;
    } catch (error) {
      this._isInitialized = false;
      throw error;
    } finally {
      this.initializationPromise = undefined;
    }
  }

  private async doInitialize(config?: any): Promise<void> {
    this.config = config || {};
    await this.onInitialize();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (!this._isInitialized) {
      throw new Error('Plugin not initialized');
    }

    const startTime = Date.now();

    try {
      // Validate input if validation is available
      if (this.validate) {
        const validation = this.validate(context);
        if (!validation.isValid) {
          return {
            success: false,
            error: `Validation failed: ${validation.errors.join(', ')}`
          };
        }
      }

      const result = await this.executeInternal(context);

      // Add timing information
      const executionTime = Date.now() - startTime;
      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTime
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: error instanceof Error ? {
          errorDetails: {
            name: error.name,
            stack: error.stack
          }
        } : undefined
      };
    }
  }

  // Abstract method that subclasses must implement
  protected abstract executeInternal(context: AgentContext): Promise<AgentResult>;

  // Optional method for getting complexity variants
  abstract getComplexityVariant(level: ComplexityLevel): AgentDefinition;

  validate(input: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // If custom schema is provided, use it
    if (this.validationSchema) {
      return this.validateWithSchema(input, this.validationSchema);
    }

    // Basic validation
    if (!input) {
      errors.push('Input is required');
    } else {
      // Validate complexity level if present
      if (input.complexity && !this.isValidComplexity(input.complexity)) {
        errors.push(`Invalid complexity level: ${input.complexity}`);
      }

      // Validate required fields based on context
      if (input.task === undefined && input.input === undefined) {
        errors.push('Either task or input must be provided');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  protected validateWithSchema(input: any, schema: any): ValidationResult {
    const errors: string[] = [];

    // Simple schema validation
    if (schema.type === 'object' && schema.required) {
      for (const field of schema.required) {
        if (!(field in input)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Validate properties if defined
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties as any)) {
        if (key in input) {
          const value = input[key];
          const prop = propSchema as any;
          if (prop.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== prop.type) {
              errors.push(`Field ${key} must be of type ${prop.type}`);
            }
          }
          if (prop.enum && !prop.enum.includes(value)) {
            errors.push(`Field ${key} must be one of: ${prop.enum.join(', ')}`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  protected isValidComplexity(complexity: string): boolean {
    if (!this.manifest.complexityLevels) {
      return true; // No restriction if not specified
    }
    return this.manifest.complexityLevels.includes(complexity as ComplexityLevel);
  }

  async destroy(): Promise<void> {
    try {
      await this.onDestroy();
    } catch (error) {
      // Silently handle errors in destroy
    } finally {
      this._isInitialized = false;
    }
  }

  protected async onInitialize(): Promise<void> {
    // Override in subclasses for custom initialization
  }

  protected async onDestroy(): Promise<void> {
    // Override in subclasses for custom cleanup
  }

  protected async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          if (timer) {
            clearTimeout(timer);
            resolve(result);
          }
        })
        .catch(error => {
          if (timer) {
            clearTimeout(timer);
            reject(error);
          }
        });
    });
  }

  // Capability-related methods
  getCapabilities(): (string | AgentCapability)[] {
    if (!this.manifest.capabilities) {
      return [];
    }

    // Return capabilities as-is (could be strings or AgentCapability objects)
    return this.manifest.capabilities;
  }

  hasCapability(capability: string): boolean {
    if (!this.manifest.capabilities) {
      return false;
    }
    return this.manifest.capabilities.some(cap =>
      typeof cap === 'string' ? cap === capability : cap.id === capability
    );
  }

  getPluginInfo(): { id: string; name: string; version: string; description?: string } {
    return {
      id: this.manifest.id,
      name: this.manifest.name,
      version: this.manifest.version,
      description: this.manifest.description
    };
  }

  getInfo(): { id: string; name: string; version: string; description?: string; isInitialized: boolean } {
    return {
      id: this.manifest.id,
      name: this.manifest.name,
      version: this.manifest.version,
      description: this.manifest.description,
      isInitialized: this._isInitialized
    };
  }
}