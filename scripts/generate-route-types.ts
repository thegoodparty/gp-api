import { glob } from 'fast-glob'
import { readFileSync, writeFileSync } from 'fs'

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Delete', 'Patch'] as const

const controllerFiles = glob.sync(`${__dirname}/../src/**/*.controller.ts`)

// map of controller name to list of routes
const routeMap: Record<
  string,
  { method: string; path: string; endpoint: string }[]
> = {}

for (const filePath of controllerFiles) {
  const content = readFileSync(filePath, 'utf8')
  const controllerMatch = content.match(/@Controller\('([^']+)'\)/)
  const relativePath = filePath.replace(`${__dirname}/../`, '')
  if (!controllerMatch) {
    const hasDecorator = content.match(/@Controller\(/)
    if (hasDecorator) {
      throw new Error(
        `${relativePath}: @Controller() must use a string literal (e.g. @Controller('my-route')). Variable references are not supported.`,
      )
    }

    throw new Error(
      `${relativePath}: Did not find a @Controller decorator in this file. Either add one, or rename the file to not match the .controller convention.`,
    )
  }
  const controller = controllerMatch[1]

  const routes: { method: string; path: string; endpoint: string }[] = []
  for (const method of HTTP_METHODS) {
    const regex = new RegExp(`@${method}\\((?:'([^']*)')?\\)`, 'g')
    let match: RegExpExecArray | null = null
    while ((match = regex.exec(content)) !== null) {
      const routePath = (match[1] ?? '').replace(/^\//, '').replace(/\/$/, '')
      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        endpoint: routePath
          ? `${method.toUpperCase()} /v1/${controller}/${routePath}`
          : `${method.toUpperCase()} /v1/${controller}`,
      })
    }
  }

  routeMap[controller] = routes
}

const endpoints = Object.values(routeMap).flatMap((routes) =>
  routes.map((route) => route.endpoint),
)

writeFileSync(
  `${__dirname}/../src/generated/route-types.ts`,
  [
    `export const CONTROLLER_NAMES = ${JSON.stringify(Object.keys(routeMap), null, 2)} as const;`,
    '',
    'export type ControllerName = (typeof CONTROLLER_NAMES)[number];',
    '',
    `export const ROUTE_MAP: Record<ControllerName, { method: string; path: string; endpoint: string }[]> = ${JSON.stringify(routeMap, null, 2)} as const;`,
    '',
    `export const ENDPOINTS = ${JSON.stringify(endpoints, null, 2)} as const;`,
    '',
    'export type Endpoint = (typeof ENDPOINTS)[number];',
  ].join('\n'),
)
