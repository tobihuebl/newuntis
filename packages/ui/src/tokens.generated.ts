// Erzeugt von scripts/gen-theme.mjs aus docs/design-system/tokens.json. Nicht von Hand ändern.
/** Schriftstile des Design Systems (Utilities text-<name>). */
export const TYPE_STYLES = ["display-xl","display-lg","h1","h2","h3","numeral-xl","numeral-lg","body-lg","body","body-strong","body-sm","label","caption","overline","mono","mono-sm"] as const;
export type TypeStyle = (typeof TYPE_STYLES)[number];
