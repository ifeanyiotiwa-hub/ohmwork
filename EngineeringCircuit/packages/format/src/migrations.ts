export type JsonObject = Record<string, unknown>
export type Migration = (document: JsonObject) => JsonObject

export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type MigrationResult = { ok: true; document: JsonObject } | { ok: false; message: string }

export function migrate(
  document: JsonObject,
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrationResult {
  let current = document
  for (let version = fromVersion; version < toVersion; version++) {
    const step = migrations[version]
    if (!step) {
      return { ok: false, message: `No migration from version ${version} to ${version + 1}` }
    }
    current = { ...step(current), version: version + 1 }
  }
  return { ok: true, document: current }
}
