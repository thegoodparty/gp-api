import { createClient, DeletedEntry, Entry } from 'contentful'
import { Injectable } from '@nestjs/common'

const { CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN } = process.env

const contentfulClient = createClient({
  space: CONTENTFUL_SPACE_ID,
  accessToken: CONTENTFUL_ACCESS_TOKEN,
})

// TODO: Move this to a key/value store to persist across application instances
let nextSyncToken = ''

const LIMIT = 300
const CALLS = 8

@Injectable()
export class ContentfulService {
  async getAllEntries(): Promise<Entry[]> {
    const allEntryCollections = []

    for (let i = 0; i < CALLS; i++) {
      const entryCollection = await contentfulClient.getEntries({
        limit: LIMIT,
        skip: i * LIMIT,
      })
      allEntryCollections.push(entryCollection)
    }

    return allEntryCollections.reduce((acc, entryCollection) => {
      return [...acc, ...entryCollection.items]
    }, [] as Entry[])
  }

  async getSync(initial = false): Promise<{
    allEntries: Entry[]
    deletedEntries: DeletedEntry[]
  }> {
    const syncCollection = await contentfulClient.sync({
      type: 'DeletedEntry',
      ...(initial || !nextSyncToken ? { initial: true } : { nextSyncToken }),
    })
    const { deletedEntries, nextSyncToken: newToken } = syncCollection
    nextSyncToken = newToken

    return {
      allEntries: await this.getAllEntries(),
      deletedEntries,
    }
  }

  async getEntry(id: string) {
    return await contentfulClient.getEntry(id)
  }
}
