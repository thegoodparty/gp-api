export type QueueMessage = {
  type: string
  data: any // any until we define the actual data structure for each message type
}
