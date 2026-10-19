/**
 * ExpressionEvaluator
 * Evaluates template expressions (${...}) and conditional clauses for ToolFlow workflows.
 */

class ExpressionEvaluator {
  /**
   * Resolves a value against context.
   * If value is a string with ${...}, interpolates or returns raw value.
   * Context is merged with process.env under `env` namespace.
   */
  static resolveValue(value, context) {
    if (typeof value !== 'string') return value;

    const fullContext = {
      ...context,
      env: process.env
    };

    const exactMatch = value.match(/^\${(.*?)}$/);
    if (exactMatch) {
      return this.evaluateExpression(exactMatch[1].trim(), fullContext);
    }

    const regex = /\${(.*?)}/g;
    return value.replace(regex, (m, expression) => {
      const val = this.evaluateExpression(expression.trim(), fullContext);
      return val !== undefined ? String(val) : 'undefined';
    });
  }

  /**
   * Resolves a dot/bracket path expression such as 'workflow.inputs.host' or 'steps.s1.outputs.code'
   */
  static evaluateExpression(expression, context) {
    if (!expression) return undefined;

    // Normalizing bracket access: foo[0] -> foo.0
    const normalized = expression.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalized.split('.');

    let current = context;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Evaluates a conditional expression string (for step `if` statements).
   * Supports:
   *  - boolean literals: true, false
   *  - equality: ==, !=
   *  - numeric comparisons: <, <=, >, >=
   *  - logical combination: &&, ||
   */
  static evaluateCondition(rawCondition, context) {
    if (typeof rawCondition === 'boolean') return rawCondition;
    if (typeof rawCondition !== 'string') return !!rawCondition;

    // Resolve template expressions first if any
    const resolved = this.resolveValue(rawCondition, context);

    if (typeof resolved === 'boolean') return resolved;
    if (typeof resolved !== 'string') return !!resolved;

    const trimmed = resolved.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Support logical OR (||)
    if (trimmed.includes('||')) {
      const clauses = trimmed.split('||');
      return clauses.some(clause => this.evaluateCondition(clause.trim(), context));
    }

    // Support logical AND (&&)
    if (trimmed.includes('&&')) {
      const clauses = trimmed.split('&&');
      return clauses.every(clause => this.evaluateCondition(clause.trim(), context));
    }

    // Comparison operators
    const operators = [
      { op: '==', fn: (a, b) => a === b },
      { op: '!=', fn: (a, b) => a !== b },
      { op: '<=', fn: (a, b) => Number(a) <= Number(b) },
      { op: '>=', fn: (a, b) => Number(a) >= Number(b) },
      { op: '<', fn: (a, b) => Number(a) < Number(b) },
      { op: '>', fn: (a, b) => Number(a) > Number(b) }
    ];

    for (const { op, fn } of operators) {
      if (trimmed.includes(op)) {
        const parts = trimmed.split(op);
        if (parts.length === 2) {
          const leftRaw = parts[0].trim();
          const rightRaw = parts[1].trim();

          const left = this._parseOperand(leftRaw);
          const right = this._parseOperand(rightRaw);

          return fn(left, right);
        }
      }
    }

    return trimmed === 'true' || trimmed === '1';
  }

  static _parseOperand(val) {
    // Strip wrapping quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    // Number check
    if (!isNaN(Number(val)) && val !== '') {
      return Number(val);
    }
    // Boolean check
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val === 'undefined') return undefined;

    return val;
  }
}

module.exports = ExpressionEvaluator;
