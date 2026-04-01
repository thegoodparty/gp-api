import { Connection, Client } from '@temporalio/client'

let client: Client | undefined

export const TASK_QUEUE = 'gp-api-polls'

export const getTemporalClient = async (): Promise<Client> => {
  if (client) return client

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  })

  client = new Client({ connection })
  return client
}
