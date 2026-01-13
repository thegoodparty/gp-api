import { HttpException } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'

export const isAxiosResponse = (error: unknown) =>
  axios.isAxiosError(error) && (error.response as AxiosResponse)

export const isNestJsHttpException = (e: unknown): e is HttpException =>
  e instanceof HttpException
