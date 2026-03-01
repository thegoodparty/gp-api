import { execSync } from 'child_process'
import {
  Project,
  SyntaxKind,
  Node,
  Scope,
  ClassDeclaration,
  SourceFile,
  CallExpression,
  Expression,
} from 'ts-morph'

const SKIP_FILES = [
  'src/shared/test-utils/mockLogger.util.ts',
  'src/main.ts',
  'src/prisma/util/prisma.util.ts',
]

const METHOD_RENAMES: Record<string, string> = {
  log: 'info',
  verbose: 'trace',
}

type MigrationResult = {
  file: string
  classLoggers: number
  moduleLoggers: number
  callsTransformed: number
  warnings: string[]
}

const getLoggerContextArg = (callExpr: CallExpression): string | undefined => {
  const args = callExpr.getArguments()
  if (args.length === 0) return undefined

  const firstArg = args[0]
  if (Node.isStringLiteral(firstArg)) return `'${firstArg.getLiteralValue()}'`
  if (Node.isPropertyAccessExpression(firstArg)) return firstArg.getText()
  return firstArg.getText()
}

type CallTransform = {
  start: number
  end: number
  replacement: string
  lineNumber: number
}

const isStringLike = (node: Expression): boolean => {
  if (
    Node.isStringLiteral(node) ||
    Node.isTemplateExpression(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  )
    return true
  const type = node.getType()
  return type.isString() || type.isStringLiteral()
}

const isJsonStringify = (node: Expression): node is CallExpression =>
  Node.isCallExpression(node) &&
  Node.isPropertyAccessExpression(node.getExpression()) &&
  node.getExpression().getText() === 'JSON.stringify'

const argToKey = (arg: Expression): string => {
  if (Node.isIdentifier(arg)) return arg.getText()
  if (Node.isPropertyAccessExpression(arg)) return arg.getName()
  return 'data'
}

const resolveArg = (arg: Expression): { text: string; inner: Expression } => {
  if (isJsonStringify(arg)) {
    const inner = arg.getArguments()[0]
    return { text: inner.getText(), inner: inner as Expression }
  }
  return { text: arg.getText(), inner: arg }
}

const extractStringifyFromTemplate = (
  node: Expression,
): { dataEntries: string[]; cleanedMessage: string } | null => {
  if (!Node.isTemplateExpression(node)) return null

  const spans = node.getTemplateSpans()
  const hasStringify = spans.some((s) => isJsonStringify(s.getExpression()))
  if (!hasStringify) return null

  const dataEntries: string[] = []
  const headText = node.getHead().getLiteralText()

  const textSegments: string[] = [headText]
  const keptExprs: string[] = []

  for (const span of spans) {
    const expr = span.getExpression()
    const litText = span.getLiteral().getLiteralText()

    if (isJsonStringify(expr)) {
      const inner = expr.getArguments()[0]
      const key = argToKey(inner as Expression)
      const innerText = inner.getText()
      dataEntries.push(key === innerText ? key : `${key}: ${innerText}`)
      textSegments[textSegments.length - 1] += litText
    } else {
      keptExprs.push(expr.getText())
      textSegments.push(litText)
    }
  }

  let cleanedMessage: string
  if (keptExprs.length === 0) {
    const text = textSegments[0].replace(/\s+/g, ' ').trim()
    cleanedMessage = text ? `'${text}'` : ''
  } else {
    cleanedMessage = '`' + textSegments[0]
    for (let i = 0; i < keptExprs.length; i++) {
      cleanedMessage += '${' + keptExprs[i] + '}' + textSegments[i + 1]
    }
    cleanedMessage += '`'
  }

  return { dataEntries, cleanedMessage }
}

const isSafeAsMergeObject = (arg: Expression): boolean => {
  if (Node.isObjectLiteralExpression(arg)) return true

  const type = arg.getType()
  if (type.isString() || type.isStringLiteral()) return false
  if (type.isNumber() || type.isNumberLiteral()) return false
  if (type.isBoolean() || type.isBooleanLiteral()) return false
  if (type.isArray() || type.isTuple()) return false
  if (type.isNull() || type.isUndefined()) return false
  if (type.isUnion()) return false

  return type.isObject()
}

const wrapAsObject = (arg: Expression): string => {
  const text = arg.getText()
  if (Node.isIdentifier(arg)) return `{ ${text} }`
  if (Node.isPropertyAccessExpression(arg))
    return `{ ${arg.getName()}: ${text} }`
  return `{ data: ${text} }`
}

const toDataEntry = (
  arg: Expression,
  index: number,
): { entry: string; needsReview: boolean } => {
  const text = arg.getText()

  if (Node.isIdentifier(arg)) return { entry: text, needsReview: false }

  if (Node.isObjectLiteralExpression(arg))
    return { entry: `...${text}`, needsReview: false }

  if (Node.isPropertyAccessExpression(arg)) {
    const propName = arg.getName()
    return { entry: `${propName}: ${text}`, needsReview: false }
  }

  if (isStringLike(arg))
    return { entry: `_arg${index}: ${text}`, needsReview: true }

  return { entry: `_arg${index}: ${text}`, needsReview: true }
}

const buildMultiArgTransform = (
  args: Expression[],
): {
  message: string | null
  dataEntries: string[]
  needsReview: boolean
} => {
  const msgIndex = args.findIndex(isStringLike)

  const message = msgIndex >= 0 ? args[msgIndex].getText() : null
  const dataArgs = args.filter((_, i) => i !== msgIndex)

  let needsReview = false
  const dataEntries = dataArgs.map((arg, i) => {
    const result = toDataEntry(arg, i)
    if (result.needsReview) needsReview = true
    return result.entry
  })

  return { message, dataEntries, needsReview }
}

const getLoggerLocalNames = (sourceFile: SourceFile): Set<string> => {
  const names = new Set<string>()
  const nestImport = sourceFile.getImportDeclaration('@nestjs/common')
  if (!nestImport) return names

  for (const named of nestImport.getNamedImports()) {
    if (named.getName() === 'Logger') {
      names.add(named.getAliasNode()?.getText() ?? 'Logger')
    }
  }
  return names
}

const transformLoggerCalls = (
  sourceFile: SourceFile,
  warnings: string[],
): number => {
  const transforms: CallTransform[] = []

  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )

  for (const call of callExpressions) {
    const expr = call.getExpression()
    if (!Node.isPropertyAccessExpression(expr)) continue

    const obj = expr.getExpression()
    const objText = obj.getText()
    if (objText !== 'this.logger' && objText !== 'logger') continue

    const methodName = expr.getName()
    if (
      !['log', 'error', 'warn', 'debug', 'verbose', 'info', 'trace'].includes(
        methodName,
      )
    )
      continue

    const args = call.getArguments()
    const newMethodName = METHOD_RENAMES[methodName] ?? methodName
    const needsRename = newMethodName !== methodName

    if (args.length > 2) {
      // @ts-expect-error - TODO: fix this
      const { message, dataEntries, needsReview } = buildMultiArgTransform(args)
      const dataObj = `{ ${dataEntries.join(', ')} }`

      transforms.push({
        start: call.getStart(),
        end: call.getEnd(),
        replacement: message
          ? `${objText}.${newMethodName}(${dataObj}, ${message})`
          : `${objText}.${newMethodName}(${dataObj})`,
        lineNumber: call.getStartLineNumber(),
      })

      if (needsReview) {
        warnings.push(
          `${sourceFile.getFilePath()}:${call.getStartLineNumber()} - ${args.length} args in ${objText}.${methodName}() call, transformed but verify result`,
        )
      }
      continue
    }

    if (args.length === 2) {
      const [first, second] = args
      const r1 = resolveArg(first as Expression)
      const r2 = resolveArg(second as Expression)

      if (isStringLike(first as Expression)) {
        const mergeArg = isSafeAsMergeObject(r2.inner)
          ? r2.text
          : wrapAsObject(r2.inner)
        transforms.push({
          start: call.getStart(),
          end: call.getEnd(),
          replacement: `${objText}.${newMethodName}(${mergeArg}, ${r1.text})`,
          lineNumber: call.getStartLineNumber(),
        })
      } else if (isStringLike(second as Expression)) {
        const mergeArg = isSafeAsMergeObject(r1.inner)
          ? r1.text
          : wrapAsObject(r1.inner)
        transforms.push({
          start: call.getStart(),
          end: call.getEnd(),
          replacement: `${objText}.${newMethodName}(${mergeArg}, ${r2.text})`,
          lineNumber: call.getStartLineNumber(),
        })
      } else if (needsRename) {
        transforms.push({
          start: call.getStart(),
          end: call.getEnd(),
          replacement: `${objText}.${newMethodName}(${r1.text}, ${r2.text})`,
          lineNumber: call.getStartLineNumber(),
        })
      }
      continue
    }

    // Single-arg: check for JSON.stringify patterns
    if (args.length === 1) {
      const arg = args[0]

      if (isJsonStringify(arg as Expression)) {
        const inner = (arg as CallExpression).getArguments()[0]
        const mergeArg = isSafeAsMergeObject(inner as Expression)
          ? inner.getText()
          : wrapAsObject(inner as Expression)
        transforms.push({
          start: call.getStart(),
          end: call.getEnd(),
          replacement: `${objText}.${newMethodName}(${mergeArg})`,
          lineNumber: call.getStartLineNumber(),
        })
        continue
      }

      if (Node.isTemplateExpression(arg)) {
        const result = extractStringifyFromTemplate(arg as Expression)
        if (result) {
          const mergeObj = `{ ${result.dataEntries.join(', ')} }`
          const replacement = result.cleanedMessage
            ? `${objText}.${newMethodName}(${mergeObj}, ${result.cleanedMessage})`
            : `${objText}.${newMethodName}(${mergeObj})`
          transforms.push({
            start: call.getStart(),
            end: call.getEnd(),
            replacement,
            lineNumber: call.getStartLineNumber(),
          })
          continue
        }
      }
    }

    if (!needsRename) continue

    const argTexts = args.map((a) => a.getText())
    transforms.push({
      start: call.getStart(),
      end: call.getEnd(),
      replacement: `${objText}.${newMethodName}(${argTexts.join(', ')})`,
      lineNumber: call.getStartLineNumber(),
    })
  }

  transforms.sort((a, b) => b.start - a.start)

  let fullText = sourceFile.getFullText()
  for (const t of transforms) {
    fullText =
      fullText.slice(0, t.start) + t.replacement + fullText.slice(t.end)
  }

  if (transforms.length > 0) {
    sourceFile.replaceWithText(fullText)
  }

  return transforms.length
}

const migrateClassLogger = (
  classDecl: ClassDeclaration,
  sourceFile: SourceFile,
  warnings: string[],
): boolean => {
  const loggerNames = getLoggerLocalNames(sourceFile)

  const loggerProp = classDecl.getProperties().find((p) => {
    const initializer = p.getInitializer()
    return (
      p.getName() === 'logger' &&
      initializer &&
      Node.isNewExpression(initializer) &&
      loggerNames.has(initializer.getExpression().getText())
    )
  })

  if (!loggerProp) return false

  const initializer = loggerProp.getInitializerOrThrow()
  if (!Node.isNewExpression(initializer)) return false

  const contextArg = getLoggerContextArg(
    initializer as unknown as CallExpression,
  )

  loggerProp.remove()

  let ctor = classDecl.getConstructors()[0]
  if (!ctor) {
    const extendsClause = classDecl.getExtends()
    ctor = classDecl.addConstructor({})
    if (extendsClause) {
      ctor.addStatements('super()')
    }
  }

  const hasLoggerParam = ctor
    .getParameters()
    .some((p) => p.getName() === 'logger')
  if (!hasLoggerParam) {
    ctor.addParameter({
      name: 'logger',
      type: 'PinoLogger',
      isReadonly: true,
      scope: Scope.Private,
    })

    if (contextArg) {
      const superCall = ctor
        .getStatements()
        .find((s) => s.getText().startsWith('super('))
      const insertIndex = superCall
        ? ctor.getStatements().indexOf(superCall) + 1
        : 0
      ctor.insertStatements(
        insertIndex,
        `this.logger.setContext(${contextArg})`,
      )
    }
  }

  return true
}

const migrateModuleLogger = (
  sourceFile: SourceFile,
  warnings: string[],
): boolean => {
  const loggerNames = getLoggerLocalNames(sourceFile)

  const varDecls = sourceFile.getVariableDeclarations().filter((v) => {
    const initializer = v.getInitializer()
    return (
      v.getName() === 'logger' &&
      initializer &&
      Node.isNewExpression(initializer) &&
      loggerNames.has(initializer.getExpression().getText())
    )
  })

  if (varDecls.length === 0) return false

  for (const varDecl of varDecls) {
    warnings.push(
      `${sourceFile.getFilePath()}:${varDecl.getStartLineNumber()} - module-level logger (const logger = new Logger(...)) needs manual migration`,
    )
  }

  return true
}

const updateImports = (sourceFile: SourceFile, hadClassLogger: boolean) => {
  const nestImport = sourceFile.getImportDeclaration('@nestjs/common')
  if (nestImport) {
    const loggerSpecifiers = nestImport
      .getNamedImports()
      .filter((n) => n.getName() === 'Logger')
    for (const spec of loggerSpecifiers) {
      if (nestImport.getNamedImports().length === 1) {
        nestImport.remove()
      } else {
        spec.remove()
      }
    }
  }

  if (hadClassLogger) {
    const existingPinoImport = sourceFile.getImportDeclaration('nestjs-pino')
    if (!existingPinoImport) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: 'nestjs-pino',
        namedImports: ['PinoLogger'],
      })
    }
  }
}

const migrateFile = (sourceFile: SourceFile): MigrationResult => {
  const result: MigrationResult = {
    file: sourceFile.getFilePath(),
    classLoggers: 0,
    moduleLoggers: 0,
    callsTransformed: 0,
    warnings: [],
  }

  const classes = sourceFile.getClasses()
  for (const classDecl of classes) {
    if (migrateClassLogger(classDecl, sourceFile, result.warnings)) {
      result.classLoggers++
    }
  }

  if (migrateModuleLogger(sourceFile, result.warnings)) {
    result.moduleLoggers++
  }

  result.callsTransformed = transformLoggerCalls(sourceFile, result.warnings)

  if (result.classLoggers > 0) {
    updateImports(sourceFile, true)
  }

  return result
}

const run = () => {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  })

  project.addSourceFilesAtPaths('src/**/*.ts')

  const sourceFiles = project.getSourceFiles().filter((sf) => {
    const path = sf.getFilePath()
    return (
      path.includes('/src/') &&
      !path.includes('.spec.') &&
      !path.includes('.test.') &&
      !path.includes('.e2e.') &&
      !SKIP_FILES.some((skip) => path.endsWith(skip))
    )
  })

  const filesToMigrate = sourceFiles.filter((sf) => {
    const text = sf.getFullText()
    return text.includes('new Logger(') || text.includes('this.logger.')
  })

  console.log(`Found ${filesToMigrate.length} files with Logger usage\n`)

  const results: MigrationResult[] = []
  const allWarnings: string[] = []

  for (const sf of filesToMigrate) {
    const result = migrateFile(sf)
    results.push(result)
    allWarnings.push(...result.warnings)
  }

  project.saveSync()

  try {
    execSync('npx prettier --write "src/**/*.ts"', { stdio: 'ignore' })
  } catch {}
  try {
    execSync('npx eslint --fix "src/**/*.ts"', { stdio: 'ignore' })
  } catch {}

  const totalClassLoggers = results.reduce((sum, r) => sum + r.classLoggers, 0)
  const totalModuleLoggers = results.reduce(
    (sum, r) => sum + r.moduleLoggers,
    0,
  )
  const totalCalls = results.reduce((sum, r) => sum + r.callsTransformed, 0)
  const filesChanged = results.filter(
    (r) => r.classLoggers > 0 || r.callsTransformed > 0,
  ).length

  console.log('=== Migration Summary ===')
  console.log(`Files changed: ${filesChanged}`)
  console.log(`Class loggers migrated: ${totalClassLoggers}`)
  console.log(`Module-level loggers (manual): ${totalModuleLoggers}`)
  console.log(`Call sites transformed: ${totalCalls}`)

  if (allWarnings.length > 0) {
    console.log(`\n=== Warnings (${allWarnings.length}) ===`)
    allWarnings.forEach((w) => console.log(`  ⚠ ${w}`))
  }
}

run()
