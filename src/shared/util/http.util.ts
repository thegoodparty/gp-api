import axios, { AxiosResponse } from 'axios'
import { HttpException } from '@nestjs/common'

export const isAxiosResponse = (error: unknown) =>
  // Axios error response is untyped — AxiosError types data as unknown
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  axios.isAxiosError(error) && (error.response as AxiosResponse)

export const isNestJsHttpException = (e: unknown): e is HttpException =>
  e instanceof HttpException
