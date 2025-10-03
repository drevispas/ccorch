import { TaskPriority, PrioritizedTask } from '../types';

export interface PriorityQueueOptions<T = PrioritizedTask> {
  capacity?: number;
  comparator?: (a: T, b: T) => number;
}

export class PriorityQueue<T = PrioritizedTask> {
  private items: T[] = [];
  private capacity: number;
  private comparator: (a: T, b: T) => number;

  constructor(options: PriorityQueueOptions<T> = {}) {
    this.capacity = options.capacity || Infinity;
    this.comparator = options.comparator || this.defaultComparator as (a: T, b: T) => number;
  }

  private defaultComparator(a: any, b: any): number {
    // Lower priority value = higher priority (CRITICAL = 0 is highest)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // If same priority, use deadline if available
    if (a.deadline && b.deadline) {
      return a.deadline.getTime() - b.deadline.getTime();
    }
    // Otherwise, FIFO based on enqueuedAt
    return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
  }

  private bubbleUp(index: number): void {
    const element = this.items[index];

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];

      if (this.comparator(element, parent) >= 0) break;

      this.items[index] = parent;
      index = parentIndex;
    }

    this.items[index] = element;
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    const element = this.items[index];

    while (true) {
      let swap = -1;
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;

      if (leftChildIndex < length) {
        const leftChild = this.items[leftChildIndex];
        if (this.comparator(leftChild, element) < 0) {
          swap = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.items[rightChildIndex];
        const compareElement = swap === -1 ? element : this.items[swap];
        if (this.comparator(rightChild, compareElement) < 0) {
          swap = rightChildIndex;
        }
      }

      if (swap === -1) break;

      this.items[index] = this.items[swap];
      index = swap;
    }

    this.items[index] = element;
  }

  enqueue(item: T): boolean {
    if (this.isFull()) {
      return false;
    }

    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
    return true;
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    const item = this.items[0];
    const end = this.items.pop();

    if (this.items.length > 0 && end) {
      this.items[0] = end;
      this.bubbleDown(0);
    }

    return item;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  remove(predicate: (item: T) => boolean): T | undefined {
    const index = this.items.findIndex(predicate);
    if (index === -1) {
      return undefined;
    }

    const item = this.items[index];
    const end = this.items.pop();

    if (index < this.items.length && end) {
      this.items[index] = end;
      const parentIndex = Math.floor((index - 1) / 2);
      if (parentIndex >= 0 && this.comparator(end, this.items[parentIndex]) < 0) {
        this.bubbleUp(index);
      } else {
        this.bubbleDown(index);
      }
    }

    return item;
  }

  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    const index = this.items.findIndex(predicate);
    if (index === -1) {
      return false;
    }

    const oldItem = this.items[index];
    const newItem = updater(oldItem);
    this.items[index] = newItem;

    // Reheapify
    const parentIndex = Math.floor((index - 1) / 2);
    if (parentIndex >= 0 && this.comparator(newItem, this.items[parentIndex]) < 0) {
      this.bubbleUp(index);
    } else {
      this.bubbleDown(index);
    }

    return true;
  }

  clear(): void {
    this.items = [];
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  isFull(): boolean {
    return this.items.length >= this.capacity;
  }

  toArray(): T[] {
    // Return a sorted copy without modifying the heap
    const copy = [...this.items];
    copy.sort(this.comparator);
    return copy;
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.items.find(predicate);
  }

  forEach(callback: (item: T, index: number) => void): void {
    this.items.forEach(callback);
  }

  getStats(): {
    size: number;
    capacity: number;
    utilization: number;
    isEmpty: boolean;
    isFull: boolean;
  } {
    return {
      size: this.size(),
      capacity: this.capacity,
      utilization: this.size() / this.capacity,
      isEmpty: this.isEmpty(),
      isFull: this.isFull(),
    };
  }
}

// Specialized priority queue for multi-level priorities
export class MultiLevelPriorityQueue {
  private queues: Map<TaskPriority, PriorityQueue<PrioritizedTask>>;
  private totalSize: number = 0;
  private capacity: number;

  constructor(capacity: number = Infinity) {
    this.capacity = capacity;
    this.queues = new Map();

    // Initialize a queue for each priority level
    Object.values(TaskPriority)
      .filter(value => typeof value === 'number')
      .forEach(priority => {
        this.queues.set(priority as TaskPriority, new PriorityQueue<PrioritizedTask>({
          comparator: (a, b) => {
            // Within same priority, sort by deadline then enqueue time
            if (a.deadline && b.deadline) {
              return a.deadline.getTime() - b.deadline.getTime();
            }
            return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
          }
        }));
      });
  }

  enqueue(task: PrioritizedTask): boolean {
    if (this.totalSize >= this.capacity) {
      return false;
    }

    const queue = this.queues.get(task.priority);
    if (!queue) {
      throw new Error(`Invalid priority: ${task.priority}`);
    }

    const success = queue.enqueue(task);
    if (success) {
      this.totalSize++;
    }

    return success;
  }

  dequeue(): PrioritizedTask | undefined {
    // Check queues in priority order
    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.MEDIUM,
      TaskPriority.LOW,
      TaskPriority.BACKGROUND,
    ];

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && !queue.isEmpty()) {
        const task = queue.dequeue();
        if (task) {
          this.totalSize--;
          return task;
        }
      }
    }

    return undefined;
  }

  dequeueByPriority(priority: TaskPriority): PrioritizedTask | undefined {
    const queue = this.queues.get(priority);
    if (!queue) {
      return undefined;
    }

    const task = queue.dequeue();
    if (task) {
      this.totalSize--;
    }

    return task;
  }

  peek(): PrioritizedTask | undefined {
    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.MEDIUM,
      TaskPriority.LOW,
      TaskPriority.BACKGROUND,
    ];

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue) {
        const task = queue.peek();
        if (task) return task;
      }
    }

    return undefined;
  }

  remove(taskId: string): PrioritizedTask | undefined {
    for (const [priority, queue] of this.queues) {
      const task = queue.remove(t => t.id === taskId);
      if (task) {
        this.totalSize--;
        return task;
      }
    }
    return undefined;
  }

  clear(): void {
    this.queues.forEach(queue => queue.clear());
    this.totalSize = 0;
  }

  size(): number {
    return this.totalSize;
  }

  sizeByPriority(priority: TaskPriority): number {
    const queue = this.queues.get(priority);
    return queue ? queue.size() : 0;
  }

  isEmpty(): boolean {
    return this.totalSize === 0;
  }

  isFull(): boolean {
    return this.totalSize >= this.capacity;
  }

  getStats(): {
    total: number;
    byPriority: Record<string, number>;
    capacity: number;
    utilization: number;
  } {
    const byPriority: Record<string, number> = {};

    this.queues.forEach((queue, priority) => {
      byPriority[TaskPriority[priority]] = queue.size();
    });

    return {
      total: this.totalSize,
      byPriority,
      capacity: this.capacity,
      utilization: this.totalSize / this.capacity,
    };
  }

  getQueueAges(): Record<string, number> {
    const ages: Record<string, number> = {};
    const now = Date.now();

    this.queues.forEach((queue, priority) => {
      const oldest = queue.peek();
      if (oldest) {
        ages[TaskPriority[priority]] = now - oldest.enqueuedAt.getTime();
      } else {
        ages[TaskPriority[priority]] = 0;
      }
    });

    return ages;
  }

  getAllTasks(): PrioritizedTask[] {
    const allTasks: PrioritizedTask[] = [];

    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.MEDIUM,
      TaskPriority.LOW,
      TaskPriority.BACKGROUND,
    ];

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue) {
        allTasks.push(...queue.toArray());
      }
    }

    return allTasks;
  }

  find(predicate: (task: PrioritizedTask) => boolean): PrioritizedTask | undefined {
    for (const queue of this.queues.values()) {
      const tasks = queue.toArray();
      const found = tasks.find(predicate);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
}