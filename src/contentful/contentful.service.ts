import {
  ContentfulClientApi,
  ContentfulCollection,
  createClient,
  DeletedEntry,
  Entry,
  EntryCollection,
  EntrySkeletonType,
  LocaleCode,
} from 'contentful'
import { Injectable } from '@nestjs/common'
import {
  AddChainModifier,
  ChainModifiers,
} from 'contentful/dist/types/types/client'

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
  private parseEntries(entries: EntryCollection<EntrySkeletonType>[]) {
    return entries.reduce((acc, entryCollection) => {
      const rawItems = entryCollection.items

      const items = contentfulClient.parseEntries(
        entryCollection as EntryCollection<
          EntrySkeletonType,
          AddChainModifier<ChainModifiers, 'WITHOUT_LINK_RESOLUTION'>
        >,
      ).items
      return acc.concat(items)
    }, [])
  }

  async getAllEntries(): Promise<Entry[]> {
    const allEntries = []

    for (let i = 0; i < CALLS; i++) {
      const entries = await contentfulClient.getEntries({
        limit: LIMIT,
        skip: i * LIMIT,
      })
      allEntries.push(entries.items as Entry[])
    }

    return this.parseEntries(allEntries)
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
    const entries = await this.getAllEntries()
    nextSyncToken = newToken
    return { allEntries: entries, deletedEntries }
  }

  async getEntry(id: string) {
    return await contentfulClient.getEntry(id)
  }
}
