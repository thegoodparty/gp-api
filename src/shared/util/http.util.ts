import axios, { AxiosResponse } from 'axios'

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const isAxiosResponse = (error: unknown) =>
  axios.isAxiosError(error) && (error.response as AxiosResponse)
