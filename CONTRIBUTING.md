# Contributing to SAP–Cardano OData V4 API

Thank you for your interest in contributing! This project bridges SAP enterprise software with the Cardano blockchain — contributions in any area are welcome.

---

## Ways to contribute

- **Bug reports** — open a GitHub issue with reproduction steps
- **Feature requests** — open an issue describing the use case
- **New Aiken validators** — follow the pattern in `aiken-contracts/validators/`
- **New test cases** — always welcome, especially integration tests
- **Documentation** — clarifications, examples, translations
- **SAP integration examples** — ABAP snippets, iFlow templates, Fiori app templates

---

## Development setup

```bash
git clone https://github.com/carpefukendiem/SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK.git
cd SAP-Cardano-OData-V4-API-with-CAP-SAP-Cardano-SDK
npm install
cp .env.example .env
# Fill in your Blockfrost key in .env
npm test        # Run all 263 tests
npm start       # Start the dev server
```

---

## Making changes

### TypeScript / SAP CAP

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Add tests for new functionality
5. Push and open a Pull Request

**Code style**: ESLint is configured — run `npm run lint` to check. We use:
- `strict: true` TypeScript
- No `any` casts (use proper type guards)
- Named exports only (no default exports)
- Descriptive error messages in all thrown errors

### Aiken smart contracts

1. Install Aiken: https://aiken-lang.org/installation-instructions
2. Edit validators in `aiken-contracts/validators/`
3. Run `aiken check` in the `aiken-contracts/` directory
4. Add or update embedded tests (`test` blocks inside the validator file)
5. Run `aiken test` to verify all Aiken tests pass

**Aiken style**:
- All validators must have embedded tests (`test_*` functions)
- Use `trace` labels from `lib/sap_cardano/errors.ak` for error messages
- Preserve the external signing pattern (no key material in datums)
- State machine transitions must be exhaustive

### Documentation

- Write for two audiences: non-technical (plain language first) and technical (details after)
- Use concrete examples, not abstract descriptions
- If you add a new contract or feature, update `docs/DELIVERABLES.md`

---

## Pull Request checklist

- [ ] `npm test` passes with all 263+ tests
- [ ] No new TypeScript `any` casts without justification
- [ ] New features have tests
- [ ] New Aiken validators have embedded tests
- [ ] `DELIVERABLES.md` updated if applicable
- [ ] Changelog entry added (in PR description)

---

## Project structure

```
├── aiken-contracts/          Cardano smart contracts (Aiken language)
│   ├── lib/sap_cardano/      Shared types, utilities, error labels
│   └── validators/           One file per contract
├── config/                   Configuration loading
├── db/                       SAP CDS schema (database entities)
├── docs/                     All documentation
│   ├── concepts & architecture/
│   ├── guides/
│   └── requirements & milestones/
├── scripts/                  CLI tools (deploy, examples, Postman)
├── srv/                      SAP CAP service implementation
│   ├── blockchain/           Cardano client, indexer, contract manager
│   └── utils/                Types, validators, error classes, mappers
└── test/                     Jest test suite
    ├── integration/           End-to-end flow tests
    ├── unit/                  Unit tests per module
    └── __mocks__/             Mock modules for testing
```

---

## Aiken contract conventions

Each validator file should contain:

```aiken
// validator/<name>.ak
// 1. Imports
use sap_cardano/types.{...}
use sap_cardano/utils.{...}
use sap_cardano/errors.{...}

// 2. Datum and Redeemer types (if not in types.ak)

// 3. Validator function
validator my_validator {
  spend(datum: Option<Datum>, redeemer: Redeemer, ctx: ScriptContext) {
    // ...
  }
}

// 4. Embedded tests (minimum 5 per validator)
test test_valid_case() {
  // ...
}
```

---

## Reporting security issues

Please do NOT open public issues for security vulnerabilities.
Email the maintainers privately or use GitHub's private security advisory feature.

Security issues include:
- Aiken validator logic bugs that could allow invalid state transitions
- Key material exposure risks
- Authentication bypass

---

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
