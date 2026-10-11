import config from '@sp/config/eslint';

export default [
  ...config,
  {
    // NestJS-Dependency-Injection liest Konstruktor-Typen zur Laufzeit (emitDecoratorMetadata):
    // diese Imports müssen Wertimporte bleiben, `import type` würde die Injection brechen.
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
