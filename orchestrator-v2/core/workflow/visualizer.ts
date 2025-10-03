import {
  WorkflowDSL,
  WorkflowAST,
  PipelineStage,
  StageType,
  WorkflowVisualization,
  VisualNode,
  VisualEdge,
  NodeStyle,
  EdgeStyle,
  LayoutConfig,
  VisualTheme,
  Port,
  StageId,
  ASTNode,
  ASTEdge,
} from './types';
import { EdgeType } from '../enums';

export interface VisualizationOptions {
  layout?: LayoutConfig;
  theme?: VisualTheme | 'light' | 'dark' | 'github';
  showMetadata?: boolean;
  showPorts?: boolean;
  interactive?: boolean;
  animateTransitions?: boolean;
  nodeSize?: { width: number; height: number };
  edgeStyle?: Partial<EdgeStyle>;
  customNodeRenderer?: (node: VisualNode) => any;
  customEdgeRenderer?: (edge: VisualEdge) => any;
}

export interface LayoutEngine {
  name: string;
  layout: (nodes: VisualNode[], edges: VisualEdge[], config: LayoutConfig) => void;
}

export class WorkflowVisualizer {
  private readonly defaultOptions: VisualizationOptions = {
    layout: {
      direction: 'TB',
      spacing: { x: 150, y: 100 },
      padding: 50,
      algorithm: 'dagre',
    },
    theme: 'light',
    showMetadata: true,
    showPorts: true,
    interactive: true,
    animateTransitions: true,
    nodeSize: { width: 200, height: 80 },
  };

  private themes: Map<string, VisualTheme>;
  private layoutEngines: Map<string, LayoutEngine>;

  constructor() {
    this.themes = new Map();
    this.layoutEngines = new Map();
    this.initializeThemes();
    this.initializeLayoutEngines();
  }

  // =====================
  // Main Visualization
  // =====================

  public visualize(
    workflow: WorkflowDSL,
    ast?: WorkflowAST,
    options?: VisualizationOptions
  ): WorkflowVisualization {
    const opts = { ...this.defaultOptions, ...options };
    const theme = this.getTheme(opts.theme);

    // Generate visual nodes and edges
    const { nodes, edges } = ast
      ? this.generateFromAST(ast, workflow, opts)
      : this.generateFromDSL(workflow, opts);

    // Apply layout
    this.applyLayout(nodes, edges, opts.layout!);

    // Apply theme
    this.applyTheme(nodes, edges, theme);

    return {
      nodes,
      edges,
      layout: opts.layout!,
      theme,
    };
  }

  // =====================
  // Generation Methods
  // =====================

  private generateFromDSL(
    workflow: WorkflowDSL,
    options: VisualizationOptions
  ): { nodes: VisualNode[]; edges: VisualEdge[] } {
    const nodes: VisualNode[] = [];
    const edges: VisualEdge[] = [];
    const nodeMap = new Map<StageId, VisualNode>();

    // Create start and end nodes
    const startNode = this.createStartNode();
    const endNode = this.createEndNode();
    nodes.push(startNode, endNode);

    // Process pipeline stages
    workflow.pipeline.forEach((stage, index) => {
      const visualNodes = this.createVisualNodes(stage, options);
      visualNodes.forEach((node) => {
        nodes.push(node);
        nodeMap.set(node.stageId, node);
      });

      // Connect to previous stage or start
      if (index === 0) {
        edges.push(this.createEdge(startNode.id, visualNodes[0].id, EdgeType.SEQUENCE));
      } else {
        const prevStage = workflow.pipeline[index - 1];
        const prevNodes = this.getStageNodes(prevStage.id, nodeMap);
        const lastPrevNode = prevNodes[prevNodes.length - 1];

        if (lastPrevNode) {
          edges.push(this.createEdge(lastPrevNode.id, visualNodes[0].id, EdgeType.SEQUENCE));
        }
      }

      // Connect to end if last
      if (index === workflow.pipeline.length - 1) {
        const lastNode = visualNodes[visualNodes.length - 1];
        edges.push(this.createEdge(lastNode.id, endNode.id, EdgeType.SEQUENCE));
      }
    });

    // Process dependencies
    workflow.pipeline.forEach((stage) => {
      if (stage.type === StageType.TASK) {
        const task = stage as any;
        if (task.dependencies) {
          task.dependencies.forEach((depId: StageId) => {
            const sourceNode = nodeMap.get(depId);
            const targetNode = nodeMap.get(stage.id);

            if (sourceNode && targetNode) {
              edges.push(this.createEdge(sourceNode.id, targetNode.id, EdgeType.SEQUENCE, 'dependency'));
            }
          });
        }
      }
    });

    return { nodes, edges };
  }

  private generateFromAST(
    ast: WorkflowAST,
    workflow: WorkflowDSL,
    options: VisualizationOptions
  ): { nodes: VisualNode[]; edges: VisualEdge[] } {
    const nodes: VisualNode[] = [];
    const edges: VisualEdge[] = [];
    const nodeMap = new Map<StageId, VisualNode>();

    // Create start and end nodes
    const startNode = this.createStartNode();
    const endNode = this.createEndNode();
    nodes.push(startNode, endNode);

    // Process AST nodes
    ast.nodes.forEach((astNode, stageId) => {
      const visualNode = this.createVisualNodeFromAST(astNode, options);
      nodes.push(visualNode);
      nodeMap.set(stageId, visualNode);
    });

    // Process AST edges
    ast.edges.forEach((astEdges, fromId) => {
      const sourceNode = nodeMap.get(fromId);

      astEdges.forEach((astEdge) => {
        const targetNode = nodeMap.get(astEdge.to);

        if (sourceNode && targetNode) {
          edges.push(
            this.createEdgeFromAST(sourceNode.id, targetNode.id, astEdge)
          );
        }
      });
    });

    // Connect start to root
    const rootNode = nodeMap.get(ast.root.id);
    if (rootNode) {
      edges.push(this.createEdge(startNode.id, rootNode.id, EdgeType.SEQUENCE));
    }

    // Connect leaf nodes to end
    const leafNodes = this.findLeafNodes(ast, nodeMap);
    leafNodes.forEach((leafNode) => {
      edges.push(this.createEdge(leafNode.id, endNode.id, EdgeType.SEQUENCE));
    });

    return { nodes, edges };
  }

  // =====================
  // Node Creation
  // =====================

  private createVisualNodes(
    stage: PipelineStage,
    options: VisualizationOptions
  ): VisualNode[] {
    const nodes: VisualNode[] = [];
    const mainNode = this.createVisualNode(stage, options);
    nodes.push(mainNode);

    // Create nodes for nested stages
    if (stage.type === StageType.SEQUENTIAL || stage.type === StageType.PARALLEL) {
      const containerStage = stage as any;
      if (containerStage.stages) {
        containerStage.stages.forEach((nestedStage: PipelineStage) => {
          const nestedNodes = this.createVisualNodes(nestedStage, options);
          nodes.push(...nestedNodes);
        });
      }
    } else if (stage.type === StageType.CONDITIONAL) {
      const conditional = stage as any;
      if (conditional.thenStage) {
        nodes.push(...this.createVisualNodes(conditional.thenStage, options));
      }
      if (conditional.elseStage) {
        nodes.push(...this.createVisualNodes(conditional.elseStage, options));
      }
    } else if (stage.type === StageType.LOOP) {
      const loop = stage as any;
      if (loop.body) {
        nodes.push(...this.createVisualNodes(loop.body, options));
      }
    }

    return nodes;
  }

  private createVisualNode(
    stage: PipelineStage,
    options: VisualizationOptions
  ): VisualNode {
    const node: VisualNode = {
      id: `node-${stage.id}`,
      stageId: stage.id,
      type: stage.type,
      label: stage.name || stage.id,
      position: { x: 0, y: 0 },
      size: options.nodeSize || { width: 200, height: 80 },
      style: this.getNodeStyle(stage.type),
      ports: options.showPorts ? this.createPorts(stage) : [],
      data: stage,
    };

    return node;
  }

  private createVisualNodeFromAST(
    astNode: ASTNode,
    options: VisualizationOptions
  ): VisualNode {
    return this.createVisualNode(astNode.stage, options);
  }

  private createStartNode(): VisualNode {
    return {
      id: 'start',
      stageId: 'start',
      type: StageType.TASK,
      label: 'Start',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50 },
      style: {
        fill: '#4CAF50',
        stroke: '#2E7D32',
        strokeWidth: 2,
        shape: 'circle',
      },
      ports: [
        {
          id: 'start-out',
          type: 'output',
          position: 'bottom',
        },
      ],
      data: {} as any,
    };
  }

  private createEndNode(): VisualNode {
    return {
      id: 'end',
      stageId: 'end',
      type: StageType.TASK,
      label: 'End',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50 },
      style: {
        fill: '#FF5252',
        stroke: '#C62828',
        strokeWidth: 2,
        shape: 'circle',
      },
      ports: [
        {
          id: 'end-in',
          type: 'input',
          position: 'top',
        },
      ],
      data: {} as any,
    };
  }

  // =====================
  // Edge Creation
  // =====================

  private createEdge(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    label?: string
  ): VisualEdge {
    return {
      id: `edge-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      label,
      style: this.getEdgeStyle(type),
      type,
    };
  }

  private createEdgeFromAST(
    sourceId: string,
    targetId: string,
    astEdge: ASTEdge
  ): VisualEdge {
    return {
      id: `edge-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      label: astEdge.condition,
      style: this.getEdgeStyle(astEdge.type),
      type: astEdge.type,
    };
  }

  // =====================
  // Styling
  // =====================

  private getNodeStyle(type: StageType): NodeStyle {
    const styles: Record<StageType, NodeStyle> = {
      [StageType.TASK]: {
        fill: '#2196F3',
        stroke: '#1565C0',
        strokeWidth: 2,
        shape: 'rectangle',
      },
      [StageType.SEQUENTIAL]: {
        fill: '#9C27B0',
        stroke: '#6A1B9A',
        strokeWidth: 2,
        shape: 'rectangle',
      },
      [StageType.PARALLEL]: {
        fill: '#FF9800',
        stroke: '#E65100',
        strokeWidth: 2,
        shape: 'diamond',
      },
      [StageType.CONDITIONAL]: {
        fill: '#FFC107',
        stroke: '#F57C00',
        strokeWidth: 2,
        shape: 'diamond',
      },
      [StageType.LOOP]: {
        fill: '#00BCD4',
        stroke: '#006064',
        strokeWidth: 2,
        shape: 'hexagon',
      },
      [StageType.SUBWORKFLOW]: {
        fill: '#795548',
        stroke: '#4E342E',
        strokeWidth: 2,
        shape: 'rectangle',
      },
      [StageType.WAIT]: {
        fill: '#9E9E9E',
        stroke: '#424242',
        strokeWidth: 2,
        shape: 'circle',
      },
      [StageType.TRANSFORM]: {
        fill: '#4CAF50',
        stroke: '#2E7D32',
        strokeWidth: 2,
        shape: 'rectangle',
      },
    };

    return styles[type];
  }

  private getEdgeStyle(type: 'sequence' | 'parallel' | 'conditional' | 'loop'): EdgeStyle {
    const styles: Record<string, EdgeStyle> = {
      sequence: {
        stroke: '#333',
        strokeWidth: 2,
        arrow: true,
      },
      parallel: {
        stroke: '#FF9800',
        strokeWidth: 2,
        strokeDasharray: '5,5',
        arrow: true,
      },
      conditional: {
        stroke: '#FFC107',
        strokeWidth: 2,
        strokeDasharray: '10,5',
        arrow: true,
      },
      loop: {
        stroke: '#00BCD4',
        strokeWidth: 2,
        strokeDasharray: '3,3',
        arrow: true,
        animated: true,
      },
    };

    return styles[type];
  }

  // =====================
  // Ports
  // =====================

  private createPorts(stage: PipelineStage): Port[] {
    const ports: Port[] = [];

    // Input port
    ports.push({
      id: `${stage.id}-in`,
      type: 'input',
      position: 'top',
      label: 'In',
    });

    // Output port(s)
    if (stage.type === StageType.CONDITIONAL) {
      ports.push({
        id: `${stage.id}-then`,
        type: 'output',
        position: 'right',
        label: 'Then',
      });

      ports.push({
        id: `${stage.id}-else`,
        type: 'output',
        position: 'left',
        label: 'Else',
      });
    } else if (stage.type === StageType.PARALLEL) {
      ports.push({
        id: `${stage.id}-out`,
        type: 'output',
        position: 'bottom',
        label: 'Out',
        multiple: true,
      });
    } else {
      ports.push({
        id: `${stage.id}-out`,
        type: 'output',
        position: 'bottom',
        label: 'Out',
      });
    }

    return ports;
  }

  // =====================
  // Layout
  // =====================

  private applyLayout(
    nodes: VisualNode[],
    edges: VisualEdge[],
    config: LayoutConfig
  ): void {
    const engine = this.layoutEngines.get(config.algorithm);

    if (engine) {
      engine.layout(nodes, edges, config);
    } else {
      // Fallback to simple grid layout
      this.applyGridLayout(nodes, config);
    }
  }

  private applyGridLayout(nodes: VisualNode[], config: LayoutConfig): void {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const nodeSize = { width: 200, height: 80 };
    const spacing = config.spacing;

    nodes.forEach((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      node.position = {
        x: config.padding + col * (nodeSize.width + spacing.x),
        y: config.padding + row * (nodeSize.height + spacing.y),
      };
    });
  }

  private applyDagreLayout(nodes: VisualNode[], edges: VisualEdge[], config: LayoutConfig): void {
    // Dagre layout implementation
    // This is a simplified version - in practice, use dagre library

    const levels = this.assignLevels(nodes, edges);
    const maxLevel = Math.max(...Array.from(levels.values()));

    // Position nodes by level
    for (let level = 0; level <= maxLevel; level++) {
      const nodesAtLevel = nodes.filter((n) => levels.get(n.id) === level);
      const levelWidth = nodesAtLevel.length * (200 + config.spacing.x);

      nodesAtLevel.forEach((node, index) => {
        node.position = {
          x: config.padding + index * (200 + config.spacing.x),
          y: config.padding + level * (80 + config.spacing.y),
        };
      });
    }
  }

  private assignLevels(
    nodes: VisualNode[],
    edges: VisualEdge[]
  ): Map<string, number> {
    const levels = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Build adjacency list
    edges.forEach((edge) => {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push(edge.target);
    });

    // Find start nodes (no incoming edges)
    const startNodes = nodes.filter(
      (node) => !edges.some((edge) => edge.target === node.id)
    );

    // BFS to assign levels
    const queue: Array<{ id: string; level: number }> = startNodes.map((n) => ({
      id: n.id,
      level: 0,
    }));

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;

      if (!levels.has(id) || levels.get(id)! > level) {
        levels.set(id, level);

        const neighbors = adjacency.get(id) || [];
        neighbors.forEach((neighbor) => {
          queue.push({ id: neighbor, level: level + 1 });
        });
      }
    }

    // Assign default level to disconnected nodes
    nodes.forEach((node) => {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0);
      }
    });

    return levels;
  }

  // =====================
  // Themes
  // =====================

  private initializeThemes(): void {
    this.themes.set('light', this.createLightTheme());
    this.themes.set('dark', this.createDarkTheme());
    this.themes.set('github', this.createGitHubTheme());
  }

  private createLightTheme(): VisualTheme {
    return {
      name: 'light',
      colors: {
        background: '#ffffff',
        node: {
          [StageType.TASK]: '#2196F3',
          [StageType.SEQUENTIAL]: '#9C27B0',
          [StageType.PARALLEL]: '#FF9800',
          [StageType.CONDITIONAL]: '#FFC107',
          [StageType.LOOP]: '#00BCD4',
          [StageType.SUBWORKFLOW]: '#795548',
          [StageType.WAIT]: '#9E9E9E',
          [StageType.TRANSFORM]: '#4CAF50',
        },
        edge: '#333333',
        text: '#000000',
        error: '#f44336',
        success: '#4caf50',
        warning: '#ff9800',
      },
      fonts: {
        family: 'Arial, sans-serif',
        size: 14,
      },
    };
  }

  private createDarkTheme(): VisualTheme {
    return {
      name: 'dark',
      colors: {
        background: '#1e1e1e',
        node: {
          [StageType.TASK]: '#42A5F5',
          [StageType.SEQUENTIAL]: '#AB47BC',
          [StageType.PARALLEL]: '#FFA726',
          [StageType.CONDITIONAL]: '#FFCA28',
          [StageType.LOOP]: '#26C6DA',
          [StageType.SUBWORKFLOW]: '#8D6E63',
          [StageType.WAIT]: '#BDBDBD',
          [StageType.TRANSFORM]: '#66BB6A',
        },
        edge: '#cccccc',
        text: '#ffffff',
        error: '#ef5350',
        success: '#66bb6a',
        warning: '#ffa726',
      },
      fonts: {
        family: 'Monaco, monospace',
        size: 14,
      },
    };
  }

  private createGitHubTheme(): VisualTheme {
    return {
      name: 'github',
      colors: {
        background: '#ffffff',
        node: {
          [StageType.TASK]: '#0969da',
          [StageType.SEQUENTIAL]: '#8250df',
          [StageType.PARALLEL]: '#fb8500',
          [StageType.CONDITIONAL]: '#fbca04',
          [StageType.LOOP]: '#0e7490',
          [StageType.SUBWORKFLOW]: '#6f42c1',
          [StageType.WAIT]: '#6e7781',
          [StageType.TRANSFORM]: '#1a7f37',
        },
        edge: '#24292f',
        text: '#24292f',
        error: '#cf222e',
        success: '#1a7f37',
        warning: '#9a6700',
      },
      fonts: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        size: 14,
      },
    };
  }

  private getTheme(theme?: VisualTheme | string): VisualTheme {
    if (typeof theme === 'string') {
      return this.themes.get(theme) || this.themes.get('light')!;
    }
    return theme || this.themes.get('light')!;
  }

  private applyTheme(nodes: VisualNode[], edges: VisualEdge[], theme: VisualTheme): void {
    nodes.forEach((node) => {
      if (node.type && theme.colors.node[node.type]) {
        node.style.fill = theme.colors.node[node.type];
      }
    });

    edges.forEach((edge) => {
      edge.style.stroke = theme.colors.edge;
    });
  }

  // =====================
  // Layout Engines
  // =====================

  private initializeLayoutEngines(): void {
    this.layoutEngines.set('dagre', {
      name: 'dagre',
      layout: (nodes, edges, config) => this.applyDagreLayout(nodes, edges, config),
    });

    this.layoutEngines.set('grid', {
      name: 'grid',
      layout: (nodes, edges, config) => this.applyGridLayout(nodes, config),
    });

    this.layoutEngines.set('force', {
      name: 'force',
      layout: (nodes, edges, config) => this.applyForceLayout(nodes, edges, config),
    });

    this.layoutEngines.set('manual', {
      name: 'manual',
      layout: () => {
        // No-op - keep existing positions
      },
    });
  }

  private applyForceLayout(
    nodes: VisualNode[],
    edges: VisualEdge[],
    config: LayoutConfig
  ): void {
    // Simplified force-directed layout
    const iterations = 100;
    const k = Math.sqrt((1000 * 1000) / nodes.length); // Optimal distance

    // Initialize random positions
    nodes.forEach((node) => {
      node.position = {
        x: Math.random() * 1000,
        y: Math.random() * 1000,
      };
    });

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, { x: number; y: number }>();

      // Initialize forces
      nodes.forEach((node) => {
        forces.set(node.id, { x: 0, y: 0 });
      });

      // Repulsive forces between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];

          const dx = node2.position.x - node1.position.x;
          const dy = node2.position.y - node1.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = (k * k) / distance;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          forces.get(node1.id)!.x -= fx;
          forces.get(node1.id)!.y -= fy;
          forces.get(node2.id)!.x += fx;
          forces.get(node2.id)!.y += fy;
        }
      }

      // Attractive forces along edges
      edges.forEach((edge) => {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);

        if (source && target) {
          const dx = target.position.x - source.position.x;
          const dy = target.position.y - source.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = (distance * distance) / k;
          const fx = (dx / distance) * force * 0.1;
          const fy = (dy / distance) * force * 0.1;

          forces.get(source.id)!.x += fx;
          forces.get(source.id)!.y += fy;
          forces.get(target.id)!.x -= fx;
          forces.get(target.id)!.y -= fy;
        }
      });

      // Apply forces with damping
      const damping = 0.85;
      nodes.forEach((node) => {
        const force = forces.get(node.id)!;
        node.position.x += force.x * damping;
        node.position.y += force.y * damping;
      });
    }

    // Center and scale
    this.centerAndScale(nodes, config);
  }

  private centerAndScale(nodes: VisualNode[], config: LayoutConfig): void {
    // Find bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    });

    // Center and add padding
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    nodes.forEach((node) => {
      node.position.x = node.position.x - centerX + config.padding + 500;
      node.position.y = node.position.y - centerY + config.padding + 500;
    });
  }

  // =====================
  // Helpers
  // =====================

  private getStageNodes(stageId: StageId, nodeMap: Map<StageId, VisualNode>): VisualNode[] {
    const nodes: VisualNode[] = [];
    const node = nodeMap.get(stageId);

    if (node) {
      nodes.push(node);
    }

    return nodes;
  }

  private findLeafNodes(
    ast: WorkflowAST,
    nodeMap: Map<StageId, VisualNode>
  ): VisualNode[] {
    const leafNodes: VisualNode[] = [];

    ast.nodes.forEach((astNode, stageId) => {
      const hasOutgoing = ast.edges.has(stageId) && ast.edges.get(stageId)!.length > 0;

      if (!hasOutgoing) {
        const visualNode = nodeMap.get(stageId);
        if (visualNode) {
          leafNodes.push(visualNode);
        }
      }
    });

    return leafNodes;
  }

  // =====================
  // Export Methods
  // =====================

  public exportToSVG(visualization: WorkflowVisualization): string {
    const { nodes, edges, theme } = visualization;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000">`;
    svg += `<rect width="2000" height="2000" fill="${theme.colors.background}" />`;

    // Draw edges
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);

      if (source && target) {
        svg += this.drawEdgeSVG(source, target, edge, theme);
      }
    });

    // Draw nodes
    nodes.forEach((node) => {
      svg += this.drawNodeSVG(node, theme);
    });

    svg += `</svg>`;
    return svg;
  }

  private drawNodeSVG(node: VisualNode, theme: VisualTheme): string {
    const { x, y } = node.position;
    const { width, height } = node.size;
    const { fill, stroke, strokeWidth, shape } = node.style;

    let shapeSVG = '';

    switch (shape) {
      case 'circle':
        shapeSVG = `<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${
          Math.min(width, height) / 2
        }" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
        break;

      case 'diamond':
        const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${
          x + width / 2
        },${y + height} ${x},${y + height / 2}`;
        shapeSVG = `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
        break;

      case 'hexagon':
        const hex = this.getHexagonPoints(x, y, width, height);
        shapeSVG = `<polygon points="${hex}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
        break;

      default:
        shapeSVG = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="5" />`;
    }

    // Add text
    const text = `<text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${
      theme.colors.text
    }" font-family="${theme.fonts.family}" font-size="${theme.fonts.size}">${
      node.label
    }</text>`;

    return shapeSVG + text;
  }

  private drawEdgeSVG(
    source: VisualNode,
    target: VisualNode,
    edge: VisualEdge,
    theme: VisualTheme
  ): string {
    const x1 = source.position.x + source.size.width / 2;
    const y1 = source.position.y + source.size.height;
    const x2 = target.position.x + target.size.width / 2;
    const y2 = target.position.y;

    let path = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${
      edge.style.stroke || theme.colors.edge
    }" stroke-width="${edge.style.strokeWidth || 2}"`;

    if (edge.style.strokeDasharray) {
      path += ` stroke-dasharray="${edge.style.strokeDasharray}"`;
    }

    path += ' />';

    // Add arrow
    if (edge.style.arrow) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;

      const x3 = x2 - arrowLength * Math.cos(angle - arrowAngle);
      const y3 = y2 - arrowLength * Math.sin(angle - arrowAngle);
      const x4 = x2 - arrowLength * Math.cos(angle + arrowAngle);
      const y4 = y2 - arrowLength * Math.sin(angle + arrowAngle);

      path += `<polyline points="${x3},${y3} ${x2},${y2} ${x4},${y4}" stroke="${
        edge.style.stroke || theme.colors.edge
      }" stroke-width="${edge.style.strokeWidth || 2}" fill="none" />`;
    }

    // Add label
    if (edge.label) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      path += `<text x="${midX}" y="${midY}" text-anchor="middle" fill="${theme.colors.text}" font-family="${theme.fonts.family}" font-size="${theme.fonts.size}">${edge.label}</text>`;
    }

    return path;
  }

  private getHexagonPoints(x: number, y: number, width: number, height: number): string {
    const points: Array<[number, number]> = [
      [x + width * 0.25, y],
      [x + width * 0.75, y],
      [x + width, y + height / 2],
      [x + width * 0.75, y + height],
      [x + width * 0.25, y + height],
      [x, y + height / 2],
    ];

    return points.map(([px, py]) => `${px},${py}`).join(' ');
  }

  public exportToDOT(visualization: WorkflowVisualization): string {
    const { nodes, edges } = visualization;

    let dot = 'digraph Workflow {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box];\n\n';

    // Add nodes
    nodes.forEach((node) => {
      dot += `  "${node.id}" [label="${node.label}"];\n`;
    });

    dot += '\n';

    // Add edges
    edges.forEach((edge) => {
      dot += `  "${edge.source}" -> "${edge.target}"`;

      if (edge.label) {
        dot += ` [label="${edge.label}"]`;
      }

      dot += ';\n';
    });

    dot += '}\n';
    return dot;
  }
}