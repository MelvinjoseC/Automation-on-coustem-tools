# Contributing to ToolFlow

Thank you for your interest in contributing to ToolFlow! We welcome contributions from developers, DevOps engineers, and QA automation specialists.

---

## 🛠️ Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/MelvinjoseC/Automation-on-coustem-tools.git
   cd "Automation-on-coustem-tools"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the automated test suites:
   ```bash
   npm test
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🧪 Testing Guidelines

ToolFlow uses a test suite covering:
- **Expression Evaluation**: `tests/evaluator.test.js`
- **Schema Validation**: `tests/validator.test.js`
- **DAG Execution & Concurrency**: `tests/dag.test.js`
- **Workflow Engine Lifecycle**: `tests/engine.test.js`

Run all suites at once using:
```bash
npm test
```

Always ensure all test suites pass before submitting a pull request.

---

## 📜 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(...)`: A new feature or capability
- `fix(...)`: A bug fix
- `refactor(...)`: Code change that neither fixes a bug nor adds a feature
- `test(...)`: Adding or correcting tests
- `docs(...)`: Documentation updates
- `ci(...)`: Changes to CI/CD workflows
- `build(...)`: Changes to build configurations or dependencies

---

## 🔒 Security Vulnerabilities

If you discover a potential security vulnerability, please report it privately to the maintainers rather than opening a public issue.
