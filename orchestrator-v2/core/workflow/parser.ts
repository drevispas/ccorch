import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkflowDSL,
  PipelineStage,
  StageType,
  ErrorStrategy,
  RetryStrategy,
  TriggerType,
  ComplexityLevel,
  WorkflowMetadata,
  VariableDefinition,
} from './types';
import { VariableType } from '../enums';
import { validateWorkflowDSL } from './schemas';

export interface ParserOptions {
  strict?: boolean;
  validateSchema?: boolean;
  resolveIncludes?: boolean;
  baseDir?: string;
  transformers?: WorkflowTransformer[];
  defaultValues?: Partial<WorkflowDSL>;
}

export interface WorkflowTransformer {
  name: string;
  transform: (workflow: any) => any;
  priority?: number;
}

export interface ParseResult {
  workflow: WorkflowDSL;
  source: 'json' | 'yaml' | 'typescript';
  warnings: ParseWarning[];
  metadata: {
    parseTime: number;
    fileSize?: number;
    includes?: string[];
  };
}

export interface ParseWarning {
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export class WorkflowParser {
  private options: ParserOptions;
  private transformers: WorkflowTransformer[];

  constructor(options: ParserOptions = {}) {
    this.options = {
      strict: true,
      validateSchema: true,
      resolveIncludes: true,
      baseDir: process.cwd(),
      ...options,
    };

    this.transformers = [
      ...this.getBuiltInTransformers(),
      ...(options.transformers || []),
    ].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  // =====================
  // Main Parsing Methods
  // =====================

  public async parseFile(filePath: string): Promise<ParseResult> {
    const startTime = Date.now();
    const warnings: ParseWarning[] = [];
    const includes: string[] = [];

    try {
      // Read file
      const content = await fs.readFile(filePath, 'utf-8');
      const fileStats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      let workflow: any;
      let source: 'json' | 'yaml' | 'typescript';

      // Parse based on file extension
      switch (ext) {
        case '.json':
          workflow = await this.parseJSON(content, filePath, warnings, includes);
          source = 'json';
          break;

        case '.yaml':
        case '.yml':
          workflow = await this.parseYAML(content, filePath, warnings, includes);
          source = 'yaml';
          break;

        case '.ts':
        case '.js':
          workflow = await this.parseTypeScript(filePath, warnings, includes);
          source = 'typescript';
          break;

        default:
          // Try to detect format from content
          workflow = await this.parseAuto(content, filePath, warnings, includes);
          source = content.trim().startsWith('{') ? 'json' : 'yaml';
      }

      // Apply transformers
      workflow = await this.applyTransformers(workflow, warnings);

      // Apply default values
      if (this.options.defaultValues) {
        workflow = this.applyDefaults(workflow, this.options.defaultValues);
      }

      // Validate if requested
      if (this.options.validateSchema) {
        const validationResult = validateWorkflowDSL(workflow);

        if (!validationResult.valid) {
          if (this.options.strict) {
            throw new Error(
              `Workflow validation failed: ${validationResult.errors
                .map((e) => e.message)
                .join(', ')}`
            );
          } else {
            validationResult.errors.forEach((error) => {
              warnings.push({
                message: error.message,
                path: error.path,
              });
            });
          }
        }

        validationResult.warnings.forEach((warning) => {
          warnings.push({
            message: warning.message,
            path: warning.path,
          });
        });
      }

      return {
        workflow: workflow as WorkflowDSL,
        source,
        warnings,
        metadata: {
          parseTime: Date.now() - startTime,
          fileSize: fileStats.size,
          includes,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse workflow file: ${error}`);
    }
  }

  public async parseString(
    content: string,
    format?: 'json' | 'yaml' | 'auto'
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const warnings: ParseWarning[] = [];
    const includes: string[] = [];

    let workflow: any;
    let source: 'json' | 'yaml';

    if (format === 'json') {
      workflow = await this.parseJSON(content, '<string>', warnings, includes);
      source = 'json';
    } else if (format === 'yaml') {
      workflow = await this.parseYAML(content, '<string>', warnings, includes);
      source = 'yaml';
    } else {
      workflow = await this.parseAuto(content, '<string>', warnings, includes);
      source = content.trim().startsWith('{') ? 'json' : 'yaml';
    }

    // Apply transformers
    workflow = await this.applyTransformers(workflow, warnings);

    // Apply defaults
    if (this.options.defaultValues) {
      workflow = this.applyDefaults(workflow, this.options.defaultValues);
    }

    // Debug: log the workflow before validation
    // console.log('Workflow before validation:', JSON.stringify(workflow, null, 2));

    // Validate
    if (this.options.validateSchema) {
      const validationResult = validateWorkflowDSL(workflow);

      if (!validationResult.valid) {
        if (this.options.strict) {
          const errorDetails = validationResult.errors.map(e =>
            `${e.path || 'root'}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`
          ).join(', ');
          throw new Error(`Workflow validation failed: ${errorDetails}`);
        } else {
          // Add validation errors as warnings in non-strict mode
          validationResult.errors.forEach((error) => {
            warnings.push({
              message: error.message,
              path: error.path || 'root',
            });
          });
        }
      }
    }

    return {
      workflow: workflow as WorkflowDSL,
      source,
      warnings,
      metadata: {
        parseTime: Date.now() - startTime,
      },
    };
  }

  // =====================
  // Format-Specific Parsers
  // =====================

  private async parseJSON(
    content: string,
    sourcePath: string,
    warnings: ParseWarning[],
    includes: string[]
  ): Promise<any> {
    try {
      const parsed = JSON.parse(content);

      // Process includes if enabled
      if (this.options.resolveIncludes) {
        return await this.resolveIncludes(parsed, sourcePath, 'json', warnings, includes);
      }

      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        const match = error.message.match(/position (\d+)/);
        const position = match ? parseInt(match[1]) : undefined;

        throw new Error(
          `JSON syntax error at ${position ? `position ${position}` : 'unknown position'}: ${
            error.message
          }`
        );
      }
      throw error;
    }
  }

  private async parseYAML(
    content: string,
    sourcePath: string,
    warnings: ParseWarning[],
    includes: string[]
  ): Promise<any> {
    try {
      const parsed = yaml.parse(content, {
        schema: 'core',
        strict: this.options.strict,
      });

      // Process includes if enabled
      if (this.options.resolveIncludes) {
        return await this.resolveIncludes(parsed, sourcePath, 'yaml', warnings, includes);
      }

      return parsed;
    } catch (error) {
      if (error instanceof yaml.YAMLParseError) {
        const pos = error.linePos?.[0];
        throw new Error(
          `YAML syntax error at line ${pos?.line || '?'}, column ${pos?.col || '?'}: ${
            error.message
          }`
        );
      }
      throw error;
    }
  }

  private async parseTypeScript(
    filePath: string,
    warnings: ParseWarning[],
    includes: string[]
  ): Promise<any> {
    try {
      // Dynamic import of TypeScript/JavaScript module
      const module = await import(filePath);

      // Look for default export or workflow export
      const workflow = module.default || module.workflow || module;

      if (typeof workflow === 'function') {
        // If it's a function, call it to get the workflow
        return await workflow();
      }

      return workflow;
    } catch (error) {
      throw new Error(`Failed to import TypeScript workflow: ${error}`);
    }
  }

  private async parseAuto(
    content: string,
    sourcePath: string,
    warnings: ParseWarning[],
    includes: string[]
  ): Promise<any> {
    // Try JSON first
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        return await this.parseJSON(content, sourcePath, warnings, includes);
      } catch {
        // Fall through to YAML
      }
    }

    // Try YAML
    try {
      return await this.parseYAML(content, sourcePath, warnings, includes);
    } catch (yamlError) {
      throw new Error(`Failed to parse content as JSON or YAML: ${yamlError}`);
    }
  }

  // =====================
  // Include Resolution
  // =====================

  private async resolveIncludes(
    obj: any,
    sourcePath: string,
    format: 'json' | 'yaml',
    warnings: ParseWarning[],
    includes: string[]
  ): Promise<any> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Handle $include directive
    if (obj.$include) {
      const includePath = this.resolvePath(obj.$include, sourcePath);
      includes.push(includePath);

      try {
        const content = await fs.readFile(includePath, 'utf-8');

        if (format === 'json') {
          return await this.parseJSON(content, includePath, warnings, includes);
        } else {
          return await this.parseYAML(content, includePath, warnings, includes);
        }
      } catch (error) {
        warnings.push({
          message: `Failed to include file ${includePath}: ${error}`,
        });

        if (this.options.strict) {
          throw error;
        }

        return obj;
      }
    }

    // Handle $ref directive (JSON Reference)
    if (obj.$ref) {
      return this.resolveReference(obj.$ref, sourcePath, warnings);
    }

    // Recursively resolve includes in nested objects
    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map((item) => this.resolveIncludes(item, sourcePath, format, warnings, includes))
      );
    }

    const resolved: any = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = await this.resolveIncludes(value, sourcePath, format, warnings, includes);
    }

    return resolved;
  }

  private resolveReference(ref: string, sourcePath: string, warnings: ParseWarning[]): any {
    // Handle JSON Reference format (#/path/to/property)
    if (ref.startsWith('#/')) {
      // Internal reference - would need access to root document
      warnings.push({
        message: `Internal references not yet supported: ${ref}`,
      });
      return null;
    }

    // External reference
    const [filePath, fragment] = ref.split('#');
    warnings.push({
      message: `External references not yet supported: ${ref}`,
    });

    return null;
  }

  private resolvePath(includePath: string, sourcePath: string): string {
    if (path.isAbsolute(includePath)) {
      return includePath;
    }

    const sourceDir = sourcePath === '<string>'
      ? this.options.baseDir || process.cwd()
      : path.dirname(sourcePath);

    return path.resolve(sourceDir, includePath);
  }

  // =====================
  // Transformers
  // =====================

  private getBuiltInTransformers(): WorkflowTransformer[] {
    return [
      {
        name: 'normalize-metadata',
        priority: 1,
        transform: (workflow) => this.normalizeMetadata(workflow),
      },
      {
        name: 'normalize-enums',
        priority: 2,
        transform: (workflow) => this.normalizeEnums(workflow),
      },
      {
        name: 'convert-shorthand',
        priority: 3,
        transform: (workflow) => this.convertShorthand(workflow),
      },
      {
        name: 'resolve-variables',
        priority: 4,
        transform: (workflow) => this.resolveVariables(workflow),
      },
      {
        name: 'optimize-structure',
        priority: 5,
        transform: (workflow) => this.optimizeStructure(workflow),
      },
    ];
  }

  private async applyTransformers(
    workflow: any,
    warnings: ParseWarning[]
  ): Promise<any> {
    let transformed = workflow;

    for (const transformer of this.transformers) {
      try {
        transformed = await transformer.transform(transformed);
      } catch (error) {
        warnings.push({
          message: `Transformer '${transformer.name}' failed: ${error}`,
        });

        if (this.options.strict) {
          throw error;
        }
      }
    }

    return transformed;
  }

  private normalizeMetadata(workflow: any): any {
    // Ensure metadata exists and has required fields
    if (!workflow.metadata) {
      workflow.metadata = {};
    }

    const metadata = workflow.metadata;

    // Set defaults
    if (!metadata.id) {
      metadata.id = `workflow-${Date.now()}`;
    }

    if (!metadata.name) {
      metadata.name = metadata.id;
    }

    if (!metadata.version) {
      metadata.version = '1.0.0';
    }

    if (!metadata.author) {
      metadata.author = 'unknown';
    }

    if (!metadata.description) {
      metadata.description = '';
    }

    if (!metadata.created) {
      metadata.created = new Date();
    }

    if (!metadata.updated) {
      metadata.updated = new Date();
    }

    if (!metadata.tags) {
      metadata.tags = [];
    }

    // Don't automatically add required workflow fields here
    // This allows validation to properly catch missing fields
    // Only normalize existing fields if they exist

    return workflow;
  }

  private normalizeEnums(workflow: any): any {
    // Normalize enum values to lowercase

    // Normalize error handling strategy
    if (workflow.errorHandling?.strategy) {
      workflow.errorHandling.strategy = this.normalizeEnumValue(workflow.errorHandling.strategy);
    }

    // Normalize retry strategies
    if (workflow.errorHandling?.retryConfig?.strategy) {
      workflow.errorHandling.retryConfig.strategy = this.normalizeEnumValue(workflow.errorHandling.retryConfig.strategy);
    }

    // Normalize pipeline stages recursively
    if (workflow.pipeline) {
      workflow.pipeline = this.normalizeStagesEnums(workflow.pipeline);
    }

    // Normalize trigger types
    if (workflow.triggers) {
      workflow.triggers = workflow.triggers.map((trigger: any) => ({
        ...trigger,
        type: this.normalizeEnumValue(trigger.type)
      }));
    }

    // Normalize variable types
    if (workflow.variables) {
      if (Array.isArray(workflow.variables)) {
        workflow.variables = workflow.variables.map((variable: any) => {
          // Don't try to spread strings
          if (typeof variable === 'string') {
            return variable;
          }
          // Only spread objects
          return {
            ...variable,
            type: variable.type ? this.normalizeEnumValue(variable.type) : variable.type
          };
        });
      } else if (typeof workflow.variables === 'object') {
        // Handle object-based variable definitions
        const normalizedVars: any = {};
        for (const [key, value] of Object.entries(workflow.variables)) {
          if (typeof value === 'object' && value !== null && 'type' in value) {
            normalizedVars[key] = {
              ...value,
              type: (value as any).type ? this.normalizeEnumValue((value as any).type) : (value as any).type
            };
          } else {
            normalizedVars[key] = value;
          }
        }
        workflow.variables = normalizedVars;
      }
    }

    return workflow;
  }

  private normalizeStagesEnums(stages: any[]): any[] {
    if (!stages) return stages;

    return stages.map(stage => {
      // Normalize stage type
      if (stage.type) {
        stage.type = this.normalizeEnumValue(stage.type);
      }

      // Normalize complexity level for task stages
      if (stage.complexity) {
        stage.complexity = this.normalizeEnumValue(stage.complexity);
      }

      // Normalize error strategy in stage error handler
      if (stage.errorHandler?.strategy) {
        stage.errorHandler.strategy = this.normalizeEnumValue(stage.errorHandler.strategy);
      }

      // Normalize retry strategy in stage
      if (stage.retryConfig?.strategy) {
        stage.retryConfig.strategy = this.normalizeEnumValue(stage.retryConfig.strategy);
      }

      // Recursively normalize nested stages
      if (stage.stages) {
        stage.stages = this.normalizeStagesEnums(stage.stages);
      }

      if (stage.body) {
        stage.body = this.normalizeStagesEnums([stage.body])[0];
      }

      if (stage.thenStage) {
        stage.thenStage = this.normalizeStagesEnums([stage.thenStage])[0];
      }

      if (stage.elseStage) {
        stage.elseStage = this.normalizeStagesEnums([stage.elseStage])[0];
      }

      // Normalize iterator type for loop stages
      if (stage.iterator?.type) {
        stage.iterator.type = this.normalizeEnumValue(stage.iterator.type);
      }

      return stage;
    });
  }

  private normalizeEnumValue(value: string): string {
    if (!value) return value;

    // Convert enum keys to their corresponding values
    // e.g., FAIL_FAST -> fail_fast, TASK -> task
    // This handles both formats: already normalized values pass through unchanged
    if (value === value.toUpperCase()) {
      // It's likely an enum key, convert to lowercase value
      return value.toLowerCase();
    }

    return value;
  }

  private convertShorthand(workflow: any): any {
    // Convert shorthand notations to full format
    // Only process fields that exist, don't add missing ones

    // Convert simple task definitions
    if (workflow.pipeline) {
      workflow.pipeline = this.expandPipelineShorthand(workflow.pipeline);
    }

    // Convert simple variable definitions
    if (workflow.variables) {
      workflow.variables = this.expandVariableShorthand(workflow.variables);
    }

    // Convert simple error handling
    if (workflow.errorHandling) {
      if (typeof workflow.errorHandling === 'string') {
        workflow.errorHandling = {
          strategy: this.normalizeEnumValue(workflow.errorHandling),
        };
      } else if (typeof workflow.errorHandling === 'object' && !workflow.errorHandling.strategy) {
        // If errorHandling exists as object but missing strategy, add default
        workflow.errorHandling.strategy = 'fail_fast';
      }
    }

    // Convert simple timeout
    if (workflow.timeouts !== undefined) {
      if (typeof workflow.timeouts === 'number') {
        workflow.timeouts = {
          global: workflow.timeouts,
        };
      }
    }

    return workflow;
  }

  private expandPipelineShorthand(pipeline: any[]): PipelineStage[] {
    return pipeline.map((stage, index) => {
      // String shorthand for simple tasks
      if (typeof stage === 'string') {
        const [agent, complexity] = stage.split(':');
        return {
          id: `task-${Date.now()}-${index}`,
          name: agent,
          type: 'task',
          agent,
          complexity: complexity || 'simple',
          input: {},
        };
      }

      // Expand nested stages recursively
      if (stage.stages) {
        stage.stages = this.expandPipelineShorthand(stage.stages);
      }

      if (stage.body) {
        stage.body = this.expandPipelineShorthand([stage.body])[0];
      }

      if (stage.thenStage) {
        stage.thenStage = this.expandPipelineShorthand([stage.thenStage])[0];
      }

      if (stage.elseStage) {
        stage.elseStage = this.expandPipelineShorthand([stage.elseStage])[0];
      }

      // Ensure required fields
      if (!stage.id) {
        stage.id = `stage-${Date.now()}-${index}`;
      }

      if (!stage.name) {
        stage.name = stage.id;
      }

      // Infer type if not specified
      if (!stage.type) {
        if (stage.agent) {
          stage.type = 'task';
        } else if (stage.stages) {
          stage.type = stage.parallel ? 'parallel' : 'sequential';
        } else if (stage.condition || stage.expression) {
          stage.type = 'conditional';
        } else if (stage.iterator) {
          stage.type = 'loop';
        } else if (stage.workflowId) {
          stage.type = 'subworkflow';
        } else if (stage.duration || stage.until || stage.event) {
          stage.type = 'wait';
        } else if (stage.transform) {
          stage.type = 'transform';
          // Transform stages require input field
          if (!stage.input) {
            stage.input = {};
          }
        }
      }

      return stage;
    });
  }

  private expandVariableShorthand(variables: any): VariableDefinition[] {
    if (Array.isArray(variables)) {
      return variables.map((variable) => {
        if (typeof variable === 'string') {
          return {
            name: variable,
            type: 'any' as const,
            required: false,
          };
        }
        // Already expanded variable object
        return variable;
      });
    }

    // Convert object notation to array
    if (typeof variables === 'object' && !Array.isArray(variables)) {
      return Object.entries(variables).map(([name, value]) => {
        if (typeof value === 'object' && value !== null && 'type' in value) {
          return {
            name,
            ...value,
          } as VariableDefinition;
        }

        return {
          name,
          type: this.inferType(value),
          defaultValue: value,
          required: false,
        } as VariableDefinition;
      });
    }

    return [];
  }

  private resolveVariables(workflow: any): any {
    // Resolve variable references in the workflow
    const variables = new Map<string, any>();

    // Collect all variables
    if (workflow.variables) {
      workflow.variables.forEach((varDef: VariableDefinition) => {
        variables.set(varDef.name, varDef.defaultValue);
      });
    }

    if (workflow.context) {
      Object.entries(workflow.context).forEach(([key, value]) => {
        variables.set(key, value);
      });
    }

    // Replace variable references
    workflow.pipeline = this.replaceVariableReferences(workflow.pipeline, variables);

    return workflow;
  }

  private replaceVariableReferences(obj: any, variables: Map<string, any>): any {
    if (typeof obj === 'string') {
      // Replace ${variable} syntax
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (variables.has(varName)) {
          return String(variables.get(varName));
        }
        return match; // Keep original if not found
      });
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceVariableReferences(item, variables));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceVariableReferences(value, variables);
      }
      return result;
    }

    return obj;
  }

  private optimizeStructure(workflow: any): any {
    // Apply basic structural optimizations

    // Remove empty stages
    if (workflow.pipeline) {
      workflow.pipeline = this.removeEmptyStages(workflow.pipeline);
    }

    // Flatten single-stage sequential blocks
    if (workflow.pipeline) {
      workflow.pipeline = this.flattenSingleStages(workflow.pipeline);
    }

    return workflow;
  }

  private removeEmptyStages(pipeline: PipelineStage[]): PipelineStage[] {
    return pipeline.filter((stage) => {
      if ('stages' in stage && Array.isArray(stage.stages)) {
        const nonEmptyStages = this.removeEmptyStages(stage.stages);

        if (nonEmptyStages.length === 0) {
          return false; // Remove empty container
        }

        stage.stages = nonEmptyStages;
      }

      return true;
    });
  }

  private flattenSingleStages(pipeline: PipelineStage[]): PipelineStage[] {
    return pipeline.map((stage) => {
      if (stage.type === StageType.SEQUENTIAL && 'stages' in stage) {
        const stages = stage.stages as PipelineStage[];

        if (stages.length === 1) {
          return stages[0]; // Flatten single-stage sequential
        }

        stage.stages = this.flattenSingleStages(stages);
      }

      return stage;
    });
  }

  private applyDefaults(workflow: any, defaults: Partial<WorkflowDSL>): any {
    const result = { ...workflow };

    // Only apply defaults for fields that exist in the workflow
    if (workflow.metadata && defaults.metadata) {
      result.metadata = {
        ...defaults.metadata,
        ...workflow.metadata,
      };
    }

    if (workflow.errorHandling && defaults.errorHandling) {
      result.errorHandling = {
        ...defaults.errorHandling,
        ...workflow.errorHandling,
      };
    }

    if (workflow.timeouts && defaults.timeouts) {
      result.timeouts = {
        ...defaults.timeouts,
        ...workflow.timeouts,
      };
    }

    if (workflow.features && defaults.features) {
      result.features = {
        ...defaults.features,
        ...workflow.features,
      };
    }

    // Apply defaults for fields that don't exist only if explicitly configured
    if (defaults.variables && !workflow.variables) {
      result.variables = defaults.variables;
    }

    if (defaults.pipeline && !workflow.pipeline) {
      result.pipeline = defaults.pipeline;
    }

    return result;
  }

  private inferType(value: any): VariableDefinition['type'] {
    if (value === null || value === undefined) {
      return VariableType.ANY;
    }
    if (typeof value === 'string') return VariableType.STRING;
    if (typeof value === 'number') return VariableType.NUMBER;
    if (typeof value === 'boolean') return VariableType.BOOLEAN;
    if (Array.isArray(value)) return VariableType.ARRAY;
    if (typeof value === 'object') return VariableType.OBJECT;
    return VariableType.ANY;
  }

  // =====================
  // Serialization
  // =====================

  public async serializeToFile(
    workflow: WorkflowDSL,
    filePath: string,
    format?: 'json' | 'yaml'
  ): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const actualFormat = format || (ext === '.json' ? 'json' : 'yaml');

    const serialized = actualFormat === 'json'
      ? this.serializeToJSON(workflow)
      : this.serializeToYAML(workflow);

    await fs.writeFile(filePath, serialized, 'utf-8');
  }

  public serializeToJSON(workflow: WorkflowDSL): string {
    // Convert enum values back to their expected format for serialization
    const serializable = this.prepareForSerialization(workflow);
    return JSON.stringify(serializable, null, 2);
  }

  public serializeToYAML(workflow: WorkflowDSL): string {
    // Convert enum values back to their expected format for serialization
    const serializable = this.prepareForSerialization(workflow);
    return yaml.stringify(serializable, {
      indent: 2,
      lineWidth: 120,
      defaultStringType: 'PLAIN',
    });
  }

  private prepareForSerialization(workflow: WorkflowDSL): any {
    // Deep clone to avoid modifying the original
    const result = JSON.parse(JSON.stringify(workflow));

    // The enum values are already in the correct lowercase format
    // No conversion needed as they match the enum definition
    return result;
  }
}