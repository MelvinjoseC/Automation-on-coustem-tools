/**
 * DAG (Directed Acyclic Graph) Planner for ToolFlow
 * Analyzes step dependencies, detects cycles, and constructs topological execution waves for concurrent processing.
 */

class DAGPlanner {
  /**
   * Builds execution waves from an array of step definitions.
   * If no step declares `dependsOn`, returns single-step sequential waves.
   * Returns: Array of step arrays, e.g. [[stepA, stepB], [stepC]]
   */
  static buildExecutionPlan(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return [];
    }

    const hasExplicitDependencies = steps.some(
      s => Array.isArray(s.dependsOn) && s.dependsOn.length > 0
    );

    // If no explicit dependencies, preserve strict sequential execution
    if (!hasExplicitDependencies) {
      return steps.map(step => [step]);
    }

    const stepMap = new Map();
    steps.forEach(step => stepMap.set(step.id, step));

    // Verify all dependsOn references exist
    steps.forEach(step => {
      if (Array.isArray(step.dependsOn)) {
        step.dependsOn.forEach(depId => {
          if (!stepMap.has(depId)) {
            throw new Error(`Step "${step.id}" depends on unknown step "${depId}"`);
          }
        });
      }
    });

    // Detect cycles using DFS
    this._detectCycles(steps, stepMap);

    // Build topological waves (Kahn's algorithm / in-degree resolution)
    const waves = [];
    const inDegree = new Map();
    const dependents = new Map();

    steps.forEach(step => {
      inDegree.set(step.id, Array.isArray(step.dependsOn) ? step.dependsOn.length : 0);
      dependents.set(step.id, []);
    });

    steps.forEach(step => {
      if (Array.isArray(step.dependsOn)) {
        step.dependsOn.forEach(depId => {
          dependents.get(depId).push(step.id);
        });
      }
    });

    let readyQueue = steps
      .filter(step => inDegree.get(step.id) === 0)
      .map(step => step);

    const executed = new Set();

    while (readyQueue.length > 0) {
      waves.push([...readyQueue]);
      const nextQueue = [];

      for (const step of readyQueue) {
        executed.add(step.id);
        for (const dependentId of dependents.get(step.id)) {
          const currentInDegree = inDegree.get(dependentId) - 1;
          inDegree.set(dependentId, currentInDegree);
          if (currentInDegree === 0) {
            nextQueue.push(stepMap.get(dependentId));
          }
        }
      }

      readyQueue = nextQueue;
    }

    if (executed.size !== steps.length) {
      throw new Error('Cyclic dependency detected in workflow steps');
    }

    return waves;
  }

  static _detectCycles(steps, stepMap) {
    const visited = new Set();
    const inStack = new Set();

    const dfs = (stepId) => {
      visited.add(stepId);
      inStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step && Array.isArray(step.dependsOn)) {
        for (const depId of step.dependsOn) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (inStack.has(depId)) {
            return true;
          }
        }
      }

      inStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (dfs(step.id)) {
          throw new Error(`Circular dependency detected involving step "${step.id}"`);
        }
      }
    }
  }
}

module.exports = DAGPlanner;
