import axios, { AxiosResponse } from 'axios'
import { HttpException } from '@nestjs/common'

export const isAxiosResponse = (error: unknown) =>
  axios.isAxiosError(error) && (error.response as AxiosResponse)

export const isNestJsHttpException = (e: unknown): e is HttpException =>
  e instanceof HttpException
