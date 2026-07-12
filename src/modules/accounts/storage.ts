import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type {
  AccountId,
  AccountMediaPreferences,
  AccountMediaType,
  AccountSummary,
} from './types'

export interface StoredAccount extends AccountSummary {
  /** Credentials are intentionally absent from AccountSummary and all UI APIs. */
  accessToken?: string
}

interface StoredPreference {
  key: string
  accountId: AccountId
  mediaType: AccountMediaType
  value: AccountMediaPreferences
}

export interface AccountStorage {
  bootstrap(): Promise<void>
  listAccounts(): Promise<readonly StoredAccount[]>
  getAccount(accountId: AccountId): Promise<StoredAccount | undefined>
  putAccount(account: StoredAccount): Promise<void>
  deleteAccount(accountId: AccountId): Promise<void>
  clearAll(): Promise<void>
  getPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
  ): Promise<AccountMediaPreferences | undefined>
  /** Ignored when the account no longer exists, including removal races. */
  putPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
    preferences: AccountMediaPreferences,
  ): Promise<void>
}

interface AccountDatabase extends DBSchema {
  accounts: {
    key: AccountId
    value: StoredAccount
  }
  preferences: {
    key: string
    value: StoredPreference
    indexes: { 'by-account': AccountId }
  }
}

const preferenceKey = (
  accountId: AccountId,
  mediaType: AccountMediaType,
): string => `${accountId}:${mediaType}`

const cloneAccount = (account: StoredAccount): StoredAccount => ({ ...account })

const clonePreferences = (
  preferences: AccountMediaPreferences,
): AccountMediaPreferences => structuredClone(preferences)

export class IndexedDbAccountStorage implements AccountStorage {
  private database: Promise<IDBPDatabase<AccountDatabase>> | null = null

  constructor(private readonly databaseName = 'anilist-bulk-edit') {}

  async bootstrap(): Promise<void> {
    await this.getDatabase()
  }

  async listAccounts(): Promise<readonly StoredAccount[]> {
    const database = await this.getDatabase()
    return (await database.getAll('accounts')).map(cloneAccount)
  }

  async getAccount(accountId: AccountId): Promise<StoredAccount | undefined> {
    const database = await this.getDatabase()
    const account = await database.get('accounts', accountId)
    return account ? cloneAccount(account) : undefined
  }

  async putAccount(account: StoredAccount): Promise<void> {
    const database = await this.getDatabase()
    await database.put('accounts', cloneAccount(account))
  }

  async deleteAccount(accountId: AccountId): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction(
      ['accounts', 'preferences'],
      'readwrite',
    )
    await transaction.objectStore('accounts').delete(accountId)

    const preferenceStore = transaction.objectStore('preferences')
    let cursor = await preferenceStore.index('by-account').openKeyCursor(accountId)
    while (cursor) {
      await preferenceStore.delete(cursor.primaryKey)
      cursor = await cursor.continue()
    }

    await transaction.done
  }

  async clearAll(): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction(
      ['accounts', 'preferences'],
      'readwrite',
    )
    await Promise.all([
      transaction.objectStore('accounts').clear(),
      transaction.objectStore('preferences').clear(),
    ])
    await transaction.done
  }

  async getPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
  ): Promise<AccountMediaPreferences | undefined> {
    const database = await this.getDatabase()
    const stored = await database.get(
      'preferences',
      preferenceKey(accountId, mediaType),
    )
    return stored ? clonePreferences(stored.value) : undefined
  }

  async putPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
    preferences: AccountMediaPreferences,
  ): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction(
      ['accounts', 'preferences'],
      'readwrite',
    )
    const account = await transaction.objectStore('accounts').get(accountId)
    if (account) {
      await transaction.objectStore('preferences').put({
        key: preferenceKey(accountId, mediaType),
        accountId,
        mediaType,
        value: clonePreferences(preferences),
      })
    }
    await transaction.done
  }

  async close(): Promise<void> {
    if (!this.database) return
    const database = await this.database
    database.close()
    this.database = null
  }

  private getDatabase(): Promise<IDBPDatabase<AccountDatabase>> {
    if (!this.database) {
      this.database = openDB<AccountDatabase>(this.databaseName, 1, {
        upgrade(database) {
          database.createObjectStore('accounts', { keyPath: 'id' })
          const preferences = database.createObjectStore('preferences', {
            keyPath: 'key',
          })
          preferences.createIndex('by-account', 'accountId')
        },
      })
    }

    return this.database
  }
}

export class InMemoryAccountStorage implements AccountStorage {
  private readonly accounts = new Map<AccountId, StoredAccount>()
  private readonly preferences = new Map<string, AccountMediaPreferences>()

  async bootstrap(): Promise<void> {}

  async listAccounts(): Promise<readonly StoredAccount[]> {
    return [...this.accounts.values()].map(cloneAccount)
  }

  async getAccount(accountId: AccountId): Promise<StoredAccount | undefined> {
    const account = this.accounts.get(accountId)
    return account ? cloneAccount(account) : undefined
  }

  async putAccount(account: StoredAccount): Promise<void> {
    this.accounts.set(account.id, cloneAccount(account))
  }

  async deleteAccount(accountId: AccountId): Promise<void> {
    this.accounts.delete(accountId)
    for (const key of this.preferences.keys()) {
      if (key.startsWith(`${accountId}:`)) this.preferences.delete(key)
    }
  }

  async clearAll(): Promise<void> {
    this.accounts.clear()
    this.preferences.clear()
  }

  async getPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
  ): Promise<AccountMediaPreferences | undefined> {
    const preferences = this.preferences.get(
      preferenceKey(accountId, mediaType),
    )
    return preferences ? clonePreferences(preferences) : undefined
  }

  async putPreferences(
    accountId: AccountId,
    mediaType: AccountMediaType,
    preferences: AccountMediaPreferences,
  ): Promise<void> {
    if (!this.accounts.has(accountId)) return
    this.preferences.set(
      preferenceKey(accountId, mediaType),
      clonePreferences(preferences),
    )
  }
}

export class AccountPreferencesRepository {
  constructor(private readonly storage: AccountStorage) {}

  get(
    accountId: AccountId,
    mediaType: AccountMediaType,
  ): Promise<AccountMediaPreferences | undefined> {
    return this.storage.getPreferences(accountId, mediaType)
  }

  set(
    accountId: AccountId,
    mediaType: AccountMediaType,
    preferences: AccountMediaPreferences,
  ): Promise<void> {
    return this.storage.putPreferences(accountId, mediaType, preferences)
  }
}
