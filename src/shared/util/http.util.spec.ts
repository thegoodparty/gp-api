import axios from 'axios'
import { isAxiosResponse } from './http.util'

jest.mock('axios')

describe('http.util', () => {
  it('isAxiosResponse returns response when AxiosError with response', () => {
    ;(axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true)
    const error = { response: { status: 400 } }
    expect(isAxiosResponse(error)).toEqual({ status: 400 })
  })

  it('isAxiosResponse returns falsey when not AxiosError', () => {
    ;(axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false)
    expect(isAxiosResponse({})).toBeFalsy()
  })
})


