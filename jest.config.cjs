/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
      },
    }],
  },
  moduleNameMapper: {
    '^@sap/cds$': '<rootDir>/test/__mocks__/@sap/cds.ts',
  },
  collectCoverageFrom: [
    'srv/**/*.ts',
    '!srv/**/*.d.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  verbose: true,
  testTimeout: 30000,
};
