import { IncomingMessage } from 'http'
import { Params } from 'nestjs-pino'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { ServerResponse } from 'http'

const determineUser = (req: IncomingMessage): string | null => {
  if (!req.headers.authorization) {
    return null
  }
  const token = req.headers.authorization.split(' ').at(1)
  if (!token) {
    return null
  }
  try {
    const decoded = jwt.verify(token, process.env.AUTH_SECRET!, {
      complete: false,
    }) as JwtPayload

    return (decoded as JwtPayload).sub || null
  } catch {
    return null
  }
}

const REQUEST_LOGGED_HEADERS = ['user-agent', 'origin']
const RESPONSE_LOGGED_HEADERS = ['content-type', 'content-length']

export const loggingConfig: Params = {
  pinoHttp: {
    customErrorMessage: () => 'Sending HTTP response',
    customSuccessMessage: () => 'Sending HTTP response',
    customReceivedMessage: () => 'HTTP request received',
    customAttributeKeys: {
      req: 'request',
      res: 'response',
      err: 'error',
      responseTime: 'responseTimeMs',
    },
    serializers: {
      req: (req: IncomingMessage) => ({
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([key]) =>
            REQUEST_LOGGED_HEADERS.includes(key),
          ),
        ),
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
        headers: Object.fromEntries(
          Object.entries(
            // @ts-expect-error - res.headers is not typed
            res.headers,
          ).filter(([key]) => RESPONSE_LOGGED_HEADERS.includes(key)),
        ),
      }),
    },
    customProps: (req: IncomingMessage) => ({
      requestId: req.id,
      userId: determineUser(req),
    }),
  },
}
