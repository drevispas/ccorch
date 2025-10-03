import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import all schemas
import {
  WorkflowIdSchema,
  TaskIdSchema,
  ComplexityLevelSchema,
  WorkflowStatusSchema,
  TaskStatusSchema,
  TodoSchema,
  AgentTypeSchema,
  WorkflowTypeSchema,
  ErrorResponseSchema
} from '../schemas/common';

import {
  InitRequestSchema,
  InitResponseSchema,
  ParseCommandRequestSchema,
  ParseCommandResponseSchema,
  ExecuteWorkflowRequestSchema,
  ExecuteWorkflowResponseSchema,
  AgentResultRequestSchema,
  AgentResultResponseSchema,
  TodosResponseSchema,
  NextTodoResponseSchema,
  NextTaskResponseSchema,
  WorkflowStatusResponseSchema,
  WorkflowsListResponseSchema,
  HealthCheckResponseSchema,
  DebugWorkflowsResponseSchema,
  DebugWorkflowDetailResponseSchema,
  DebugTaskResponseSchema,
  RecoverWorkflowResponseSchema,
  ResetTaskResponseSchema
} from '../schemas/api';

export class OpenAPIGenerator {
  private registry: OpenAPIRegistry;

  constructor() {
    this.registry = new OpenAPIRegistry();
    this.registerSchemas();
    this.registerEndpoints();
  }

  private registerSchemas(): void {
    // Register common schemas as components
    this.registry.register('WorkflowId', WorkflowIdSchema);
    this.registry.register('TaskId', TaskIdSchema);
    this.registry.register('ComplexityLevel', ComplexityLevelSchema);
    this.registry.register('WorkflowStatus', WorkflowStatusSchema);
    this.registry.register('TaskStatus', TaskStatusSchema);
    this.registry.register('Todo', TodoSchema);
    this.registry.register('AgentType', AgentTypeSchema);
    this.registry.register('WorkflowType', WorkflowTypeSchema);
    this.registry.register('ErrorResponse', ErrorResponseSchema);
  }

  private registerEndpoints(): void {
    // POST /api/init
    this.registry.registerPath({
      method: 'post',
      path: '/api/init',
      summary: 'Initialize the orchestrator server',
      description: 'Initializes all core components needed for workflow execution including workflow loader, agent loader, command parser, and state management.',
      tags: ['System'],
      request: {
        body: {
          content: {
            'application/json': {
              schema: InitRequestSchema
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Successful initialization',
          content: {
            'application/json': {
              schema: InitResponseSchema
            }
          }
        },
        500: {
          description: 'Initialization failed',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // POST /api/parse-command
    this.registry.registerPath({
      method: 'post',
      path: '/api/parse-command',
      summary: 'Parse a workflow command',
      description: 'Parses natural language commands to detect workflow type and extract parameters.',
      tags: ['Workflow'],
      request: {
        body: {
          content: {
            'application/json': {
              schema: ParseCommandRequestSchema
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Command parsed successfully',
          content: {
            'application/json': {
              schema: ParseCommandResponseSchema
            }
          }
        },
        500: {
          description: 'Failed to parse command',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // POST /api/execute
    this.registry.registerPath({
      method: 'post',
      path: '/api/execute',
      summary: 'Execute a workflow',
      description: 'Starts workflow execution with the specified parameters and complexity level.',
      tags: ['Workflow'],
      request: {
        body: {
          content: {
            'application/json': {
              schema: ExecuteWorkflowRequestSchema
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Workflow started successfully',
          content: {
            'application/json': {
              schema: ExecuteWorkflowResponseSchema
            }
          }
        },
        500: {
          description: 'Failed to execute workflow',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // GET /api/todos/{workflowId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/todos/{workflowId}',
      summary: 'Get todos for a workflow',
      description: 'Retrieves all todo items for the specified workflow.',
      tags: ['Workflow'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Todos retrieved successfully',
          content: {
            'application/json': {
              schema: TodosResponseSchema
            }
          }
        }
      }
    });

    // GET /api/next-todo/{workflowId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/next-todo/{workflowId}',
      summary: 'Get next pending todo',
      description: 'Retrieves the next pending or in-progress todo item for the workflow.',
      tags: ['Workflow'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Next todo retrieved',
          content: {
            'application/json': {
              schema: NextTodoResponseSchema
            }
          }
        }
      }
    });

    // GET /api/next-task/{workflowId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/next-task/{workflowId}',
      summary: 'Get next pending task',
      description: 'Retrieves the next pending task for Claude Code to execute.',
      tags: ['Task'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Next task retrieved',
          content: {
            'application/json': {
              schema: NextTaskResponseSchema
            }
          }
        }
      }
    });

    // POST /api/agent-result
    this.registry.registerPath({
      method: 'post',
      path: '/api/agent-result',
      summary: 'Submit agent execution result',
      description: 'Submits the result of an agent execution back to the orchestrator.',
      tags: ['Task'],
      request: {
        body: {
          content: {
            'application/json': {
              schema: AgentResultRequestSchema
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Result received successfully',
          content: {
            'application/json': {
              schema: AgentResultResponseSchema
            }
          }
        },
        404: {
          description: 'Task not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        },
        500: {
          description: 'Failed to process result',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // GET /api/status/{workflowId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/status/{workflowId}',
      summary: 'Get workflow status',
      description: 'Retrieves detailed status information for a specific workflow.',
      tags: ['Workflow'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Workflow status retrieved',
          content: {
            'application/json': {
              schema: WorkflowStatusResponseSchema
            }
          }
        },
        404: {
          description: 'Workflow not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // GET /api/workflows
    this.registry.registerPath({
      method: 'get',
      path: '/api/workflows',
      summary: 'List all workflows',
      description: 'Retrieves a list of all active workflows.',
      tags: ['Workflow'],
      responses: {
        200: {
          description: 'Workflows retrieved successfully',
          content: {
            'application/json': {
              schema: WorkflowsListResponseSchema
            }
          }
        }
      }
    });

    // GET /api/health
    this.registry.registerPath({
      method: 'get',
      path: '/api/health',
      summary: 'Health check',
      description: 'Returns the health status of the orchestrator server.',
      tags: ['System'],
      responses: {
        200: {
          description: 'Server is healthy',
          content: {
            'application/json': {
              schema: HealthCheckResponseSchema
            }
          }
        }
      }
    });

    // GET /api/debug/workflows
    this.registry.registerPath({
      method: 'get',
      path: '/api/debug/workflows',
      summary: 'Debug - Get all system state',
      description: 'Returns detailed debugging information about all workflows, tasks, and todos.',
      tags: ['Debug'],
      responses: {
        200: {
          description: 'Debug information retrieved',
          content: {
            'application/json': {
              schema: DebugWorkflowsResponseSchema
            }
          }
        }
      }
    });

    // GET /api/debug/workflow/{workflowId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/debug/workflow/{workflowId}',
      summary: 'Debug - Get workflow details',
      description: 'Returns detailed debugging information for a specific workflow.',
      tags: ['Debug'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Workflow debug information retrieved',
          content: {
            'application/json': {
              schema: DebugWorkflowDetailResponseSchema
            }
          }
        },
        404: {
          description: 'Workflow not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // GET /api/debug/task/{taskId}
    this.registry.registerPath({
      method: 'get',
      path: '/api/debug/task/{taskId}',
      summary: 'Debug - Get task details',
      description: 'Returns detailed debugging information for a specific task.',
      tags: ['Debug'],
      request: {
        params: z.object({
          taskId: TaskIdSchema
        })
      },
      responses: {
        200: {
          description: 'Task debug information retrieved',
          content: {
            'application/json': {
              schema: DebugTaskResponseSchema
            }
          }
        },
        404: {
          description: 'Task not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // POST /api/recover-workflow/{workflowId}
    this.registry.registerPath({
      method: 'post',
      path: '/api/recover-workflow/{workflowId}',
      summary: 'Recover stuck workflow',
      description: 'Attempts to recover a stuck workflow by creating the next task in sequence.',
      tags: ['Recovery'],
      request: {
        params: z.object({
          workflowId: WorkflowIdSchema
        })
      },
      responses: {
        200: {
          description: 'Recovery attempted',
          content: {
            'application/json': {
              schema: RecoverWorkflowResponseSchema
            }
          }
        },
        404: {
          description: 'Workflow not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        },
        500: {
          description: 'Recovery failed',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });

    // POST /api/reset-task/{taskId}
    this.registry.registerPath({
      method: 'post',
      path: '/api/reset-task/{taskId}',
      summary: 'Reset stuck task',
      description: 'Resets a stuck task to awaiting execution status.',
      tags: ['Recovery'],
      request: {
        params: z.object({
          taskId: TaskIdSchema
        })
      },
      responses: {
        200: {
          description: 'Task reset successfully',
          content: {
            'application/json': {
              schema: ResetTaskResponseSchema
            }
          }
        },
        404: {
          description: 'Task not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        },
        500: {
          description: 'Reset failed',
          content: {
            'application/json': {
              schema: ErrorResponseSchema
            }
          }
        }
      }
    });
  }

  public generateOpenAPIDocument(): any {
    const generator = new OpenApiGeneratorV31(this.registry.definitions);

    return generator.generateDocument({
      openapi: '3.1.0',
      info: {
        title: 'Orchestrator API',
        version: '2.0.0',
        description: 'Type-safe orchestrator API for Claude Code integration with comprehensive workflow and task management.',
        contact: {
          name: 'Orchestrator Team',
          email: 'orchestrator@example.com'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Local development server'
        },
        {
          url: 'https://orchestrator.example.com',
          description: 'Production server'
        }
      ],
      tags: [
        {
          name: 'System',
          description: 'System management endpoints'
        },
        {
          name: 'Workflow',
          description: 'Workflow management endpoints'
        },
        {
          name: 'Task',
          description: 'Task execution endpoints'
        },
        {
          name: 'Debug',
          description: 'Debugging and inspection endpoints'
        },
        {
          name: 'Recovery',
          description: 'Recovery and error handling endpoints'
        }
      ],
      security: [
        {
          apiKey: []
        }
      ]
    });
  }

  public async saveOpenAPIDocument(outputPath: string, format: 'json' | 'yaml' = 'yaml'): Promise<void> {
    const document = this.generateOpenAPIDocument();

    const content = format === 'yaml'
      ? yaml.stringify(document)
      : JSON.stringify(document, null, 2);

    const extension = format === 'yaml' ? 'yaml' : 'json';
    const fullPath = path.join(outputPath, `openapi.${extension}`);

    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`OpenAPI documentation saved to ${fullPath}`);
  }

  public generateSwaggerUIHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Orchestrator API Documentation</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
    <style>
        body {
            margin: 0;
            padding: 0;
        }
        #swagger-ui {
            padding: 20px;
        }
        .topbar {
            display: none;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: "/api/openapi.json",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.SwaggerUIStandalonePreset
                ],
                layout: "BaseLayout"
            });
            window.ui = ui;
        }
    </script>
</body>
</html>
    `;
  }
}

// CLI tool to generate OpenAPI documentation
if (require.main === module) {
  const generator = new OpenAPIGenerator();

  const args = process.argv.slice(2);
  const format = args.includes('--json') ? 'json' : 'yaml';
  const outputPath = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || './docs';

  generator.saveOpenAPIDocument(outputPath, format)
    .then(() => console.log('OpenAPI documentation generated successfully'))
    .catch(error => console.error('Error generating OpenAPI documentation:', error));
}