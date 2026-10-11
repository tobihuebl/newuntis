# ADR 0001: TypeScript 5.9 statt 7.x

Status: akzeptiert (M0)

**Kontext:** TypeScript 7.0 (nativer Compiler) ist veröffentlicht, bringt aber die klassische Compiler-API nicht mit.
`tsup` erzeugt Typdeklarationen über `rollup-plugin-dts`, das diese API nutzt, und scheiterte mit TS 7 (`useCaseSensitiveFileNames`).
Auch `typescript-eslint` und Next.js hängen an der API.

**Entscheidung:** TypeScript `~5.9` im gesamten Monorepo.

**Folgen:** Erneut prüfen, sobald tsup, typescript-eslint und Next.js TS 7 offiziell unterstützen.
