/**
 * Manifest Schema Validator for ToolFlow
 * Validates Tool and Workflow YAML manifests before registration and execution.
 */

class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

class SchemaValidator {
  /**
   * Validate a Tool manifest
   */
  static validateTool(tool) {
    const errors = [];

    if (!tool || typeof tool !== 'object') {
      return { valid: false, errors: ['Tool manifest must be an object'] };
    }

    if (!tool.name || typeof tool.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      errors.push('Tool "name" is required and must be alphanumeric (letters, numbers, _, -)');
    }

    const validTypes = ['script', 'api'];
    if (!tool.type || !validTypes.includes(tool.type)) {
      errors.push(`Tool "type" must be one of: ${validTypes.join(', ')}`);
    }

    if (tool.type === 'script' && (!tool.scriptPath || typeof tool.scriptPath !== 'string')) {
      errors.push('Script tool requires a valid "scriptPath" string');
    }

    if (tool.inputs !== undefined) {
      if (!Array.isArray(tool.inputs)) {
        errors.push('"inputs" must be an array');
      } else {
        tool.inputs.forEach((input, idx) => {
          if (!input.name || typeof input.name !== 'string') {
            errors.push(`Input at index ${idx} must have a "name"`);
          }
          if (input.type && !['string', 'number', 'boolean', 'object'].includes(input.type)) {
            errors.push(`Input "${input.name || idx}" has unsupported type "${input.type}"`);
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate a Workflow manifest
   */
  static validateWorkflow(workflow, availableTools = null) {
    const errors = [];

    if (!workflow || typeof workflow !== 'object') {
      return { valid: false, errors: ['Workflow manifest must be an object'] };
    }

    if (!workflow.name || typeof workflow.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(workflow.name)) {
      errors.push('Workflow "name" is required and must be alphanumeric (letters, numbers, _, -)');
    }

    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      errors.push('Workflow must contain a non-empty "steps" array');
      return { valid: false, errors };
    }

    const stepIds = new Set();

    workflow.steps.forEach((step, idx) => {
      const stepLabel = step.id || `index ${idx}`;

      if (!step.id || typeof step.id !== 'string') {
        errors.push(`Step at index ${idx} requires a unique "id" string`);
      } else if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID "${step.id}" detected`);
      } else {
        stepIds.add(step.id);
      }

      if (!step.tool || typeof step.tool !== 'string') {
        errors.push(`Step "${stepLabel}" requires a "tool" reference`);
      } else if (availableTools && !availableTools.includes(step.tool)) {
        errors.push(`Step "${stepLabel}" references unknown tool "${step.tool}"`);
      }

      if (step.timeout !== undefined && (typeof step.timeout !== 'number' || step.timeout <= 0)) {
        errors.push(`Step "${stepLabel}" timeout must be a positive integer`);
      }

      if (step.retries !== undefined && (typeof step.retries !== 'number' || step.retries < 0)) {
        errors.push(`Step "${stepLabel}" retries must be a non-negative integer`);
      }

      if (step.retryDelay !== undefined && (typeof step.retryDelay !== 'number' || step.retryDelay < 0)) {
        errors.push(`Step "${stepLabel}" retryDelay must be a non-negative integer`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  SchemaValidator,
  ValidationError
};
