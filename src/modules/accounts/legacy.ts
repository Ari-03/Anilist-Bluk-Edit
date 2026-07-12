import type { BrowserAccountManager } from './manager'
import type { StorageLike } from './oauth'
import type { AccountSummary } from './types'

export const LEGACY_AUTH_STORAGE_KEYS = [
  'anilist-bulk-edit-store',
  'anilist_access_token',
  'anilist_user_data',
  'anilist_last_validation',
] as const

export interface LegacyAccountSummary {
  readonly source: 'zustand' | 'direct'
}

/**
 * Opaque capability for an explicit legacy-account migration. The credential
 * is held in this module's private WeakMap rather than on the handle itself.
 */
export interface LegacyAccountMigration {
  readonly summary: Readonly<LegacyAccountSummary>
}

const migrationTokens = new WeakMap<LegacyAccountMigration, string>()

function createLegacyMigration(
  accessToken: string,
  source: LegacyAccountSummary['source'],
): LegacyAccountMigration {
  const migration = Object.freeze({
    summary: Object.freeze({ source }),
  })
  migrationTokens.set(migration, accessToken)
  return migration
}

function tokenFromZustand(serialized: string | null): string | null {
  if (!serialized) return null
  try {
    const payload = JSON.parse(serialized) as {
      state?: { accessToken?: unknown }
    }
    return typeof payload.state?.accessToken === 'string' &&
      payload.state.accessToken.length > 0
      ? payload.state.accessToken
      : null
  } catch {
    return null
  }
}

/** Discovery is read-only; importing always requires an explicit caller action. */
export function discoverLegacyAccount(
  storage: StorageLike,
): LegacyAccountMigration | null {
  const persisted = tokenFromZustand(storage.getItem('anilist-bulk-edit-store'))
  if (persisted) return createLegacyMigration(persisted, 'zustand')

  const direct = storage.getItem('anilist_access_token')
  return direct ? createLegacyMigration(direct, 'direct') : null
}

export function deleteLegacyAuthentication(storage: StorageLike): void {
  for (const key of LEGACY_AUTH_STORAGE_KEYS) storage.removeItem(key)
}

export async function importLegacyAccount(
  migration: LegacyAccountMigration,
  manager: BrowserAccountManager,
  legacyStorage: StorageLike,
): Promise<AccountSummary> {
  const accessToken = migrationTokens.get(migration)
  if (!accessToken) throw new Error('The legacy migration is no longer available.')

  const account = await manager.importLegacyToken(accessToken)
  deleteLegacyAuthentication(legacyStorage)
  migrationTokens.delete(migration)
  return account
}
