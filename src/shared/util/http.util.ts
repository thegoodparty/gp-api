import axios, { AxiosResponse } from 'axios'

export const isAxiosResponse = (error: unknown) =>
  axios.isAxiosError(error) && (error.response as AxiosResponse)
