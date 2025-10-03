import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple JSON schema validator implementation
export class SchemaValidator {
  private workflowSchema: any;
  private agentSchema: any;

  constructor() {
    // Schemas will be loaded lazily
  }

  async initialize(): Promise<void> {
    const workflowSchemaPath = join(__dirname, 'schemas/workflow-schema.json');
    const agentSchemaPath = join(__dirname, 'schemas/agent-schema.json');

    try {
      const workflowSchemaContent = await fs.readFile(workflowSchemaPath, 'utf-8');
      const agentSchemaContent = await fs.readFile(agentSchemaPath, 'utf-8');

      this.workflowSchema = JSON.parse(workflowSchemaContent);
      this.agentSchema = JSON.parse(agentSchemaContent);
    } catch (error) {
      throw new Error(`Failed to load schemas: ${error}`);
    }
  }

  validateWorkflow(workflow: any): ValidationResult {
    if (!this.workflowSchema) {
      throw new Error('Schema validator not initialized');
    }

    return this.validateAgainstSchema(workflow, this.workflowSchema, 'workflow');
  }

  validateAgent(agent: any): ValidationResult {
    if (!this.agentSchema) {
      throw new Error('Schema validator not initialized');
    }

    return this.validateAgainstSchema(agent, this.agentSchema, 'agent');
  }

  private validateAgainstSchema(data: any, schema: any, type: string): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      this.validateObject(data, schema, '', errors);
    } catch (error) {
      errors.push({
        path: '',
        message: `Failed to validate ${type}: ${error}`,
        expected: schema.type || 'object',
        actual: typeof data
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateObject(data: any, schema: any, path: string, errors: ValidationError[]): void {
    if (schema.type) {
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      if (actualType !== schema.type) {
        errors.push({
          path,
          message: `Expected ${schema.type}, got ${actualType}`,
          expected: schema.type,
          actual: actualType
        });
        return;
      }
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in data)) {
          errors.push({
            path: path ? `${path}.${requiredProp}` : requiredProp,
            message: `Missing required property: ${requiredProp}`,
            expected: 'required property',
            actual: 'undefined'
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${propName}` : propName;

        if (propName in data) {
          this.validateProperty(data[propName], propSchema, propPath, errors);
        }
      }
    }

    // Check for additional properties if not allowed
    if (schema.additionalProperties === false) {
      const allowedProps = Object.keys(schema.properties || {});
      for (const propName of Object.keys(data)) {
        if (!allowedProps.includes(propName)) {
          errors.push({
            path: path ? `${path}.${propName}` : propName,
            message: `Additional property not allowed: ${propName}`,
            expected: 'allowed properties: ' + allowedProps.join(', '),
            actual: propName
          });
        }
      }
    }

    // Validate string constraints
    if (schema.type === 'string') {
      this.validateString(data, schema, path, errors);
    }

    // Validate array constraints
    if (schema.type === 'array') {
      this.validateArray(data, schema, path, errors);
    }
  }

  private validateProperty(data: any, schema: any, path: string, errors: ValidationError[]): void {
    // Handle oneOf
    if (schema.oneOf) {
      let hasValidOption = false;
      for (const option of schema.oneOf) {
        const tempErrors: ValidationError[] = [];
        this.validateObject(data, option, path, tempErrors);
        if (tempErrors.length === 0) {
          hasValidOption = true;
          break;
        }
      }

      if (!hasValidOption) {
        errors.push({
          path,
          message: 'Value does not match any of the allowed schemas',
          expected: 'one of the defined schemas',
          actual: typeof data
        });
      }
      return;
    }

    // Handle $ref (simplified)
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/definitions/', '');
      const refSchema = this.getDefinition(refPath);
      if (refSchema) {
        this.validateObject(data, refSchema, path, errors);
      }
      return;
    }

    // Handle const
    if (schema.const && data !== schema.const) {
      errors.push({
        path,
        message: `Expected constant value: ${schema.const}`,
        expected: schema.const,
        actual: data
      });
      return;
    }

    // Regular validation
    this.validateObject(data, schema, path, errors);
  }

  private validateString(data: any, schema: any, path: string, errors: ValidationError[]): void {
    if (typeof data !== 'string') return;

    if (schema.minLength && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String too short. Minimum length: ${schema.minLength}`,
        expected: `>= ${schema.minLength} characters`,
        actual: `${data.length} characters`
      });
    }

    if (schema.maxLength && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String too long. Maximum length: ${schema.maxLength}`,
        expected: `<= ${schema.maxLength} characters`,
        actual: `${data.length} characters`
      });
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push({
        path,
        message: `String does not match pattern: ${schema.pattern}`,
        expected: `pattern: ${schema.pattern}`,
        actual: data
      });
    }

    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Value not in allowed list: ${schema.enum.join(', ')}`,
        expected: schema.enum.join(' | '),
        actual: data
      });
    }
  }

  private validateArray(data: any, schema: any, path: string, errors: ValidationError[]): void {
    if (!Array.isArray(data)) return;

    if (schema.minItems && data.length < schema.minItems) {
      errors.push({
        path,
        message: `Array too short. Minimum items: ${schema.minItems}`,
        expected: `>= ${schema.minItems} items`,
        actual: `${data.length} items`
      });
    }

    if (schema.maxItems && data.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array too long. Maximum items: ${schema.maxItems}`,
        expected: `<= ${schema.maxItems} items`,
        actual: `${data.length} items`
      });
    }

    if (schema.uniqueItems) {
      const seen = new Set();
      for (let i = 0; i < data.length; i++) {
        const item = JSON.stringify(data[i]);
        if (seen.has(item)) {
          errors.push({
            path: `${path}[${i}]`,
            message: 'Array items must be unique',
            expected: 'unique items',
            actual: 'duplicate item'
          });
        }
        seen.add(item);
      }
    }

    // Validate array items
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        this.validateProperty(data[i], schema.items, `${path}[${i}]`, errors);
      }
    }
  }

  private getDefinition(name: string): any {
    // This is a simplified implementation
    // In a real implementation, you'd need to resolve the $ref properly
    if (this.workflowSchema?.definitions?.[name]) {
      return this.workflowSchema.definitions[name];
    }
    if (this.agentSchema?.definitions?.[name]) {
      return this.agentSchema.definitions[name];
    }
    return null;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  expected: string;
  actual: string;
}