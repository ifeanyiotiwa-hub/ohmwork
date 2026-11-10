/** A problem in plain language. `kind` marks the ones the app shows on the part itself ("burn-out": overheating). */
export type SimIssue = { componentIds: string[]; message: string; kind?: "burn-out" }
