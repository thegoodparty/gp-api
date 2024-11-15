import { createClient, DeletedEntry, Entry } from 'contentful'
import { Injectable } from '@nestjs/common'

const { CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN } = process.env

const contentfulClient = createClient({
  space: CONTENTFUL_SPACE_ID,
  accessToken: CONTENTFUL_ACCESS_TOKEN,
})

// TODO: Move this to a key/value store to persist across application instances
let nextSyncToken = ''

@Injectable()
export class ContentfulService {
  async getSync(
    initial = false,
  ): Promise<{ entries: Entry[]; deletedEntries: DeletedEntry[] }> {
    const {
      entries,
      deletedEntries,
      nextSyncToken: newToken,
    } = await contentfulClient.sync({
      ...(initial || !nextSyncToken ? { initial: true } : { nextSyncToken }),
    })
    nextSyncToken = newToken
    return { entries, deletedEntries }
  }

  async getEntry(id: string) {
    return await contentfulClient.getEntry(id)
  }
}
