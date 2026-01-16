import {
  ComponentResource,
  ComponentResourceOptions,
  Input,
  Output,
  all,
  interpolate,
  output,
} from '@pulumi/pulumi'
import { dns as awsDns } from './dns'
import { DnsValidatedCertificate } from './dns-validated-certificate'
import { appautoscaling, ec2, ecs, iam, lb } from '@pulumi/aws'
import { Vpc } from './vpc.js'
import { DurationMinutes, toSeconds } from './duration'
import {
  FargateBaseArgs,
  createExecutionRole,
  createTaskDefinition,
  createTaskRole,
  normalizeContainers,
} from './fargate'
import { hashStringToPrettyString } from './naming'

type Port = `${number}/${'http' | 'https' | 'tcp' | 'udp' | 'tcp_udp' | 'tls'}`

interface ServiceRules {
  /**
   * The port and protocol the service listens on. Uses the format `{port}/{protocol}`.
   *
   * @example
   * ```js
   * {
   *   listen: "80/http"
   * }
   * ```
   */
  listen: Input<Port>
  /**
   * The port and protocol of the container the service forwards the traffic to. Uses the
   * format `{port}/{protocol}`.
   *
   * @example
   * ```js
   * {
   *   forward: "80/http"
   * }
   * ```
   * @default The same port and protocol as `listen`.
   */
  forward?: Input<Port>
  /**
   * The name of the container to forward the traffic to. This maps to the `name` defined in the
   * `container` prop.
   *
   * You only need this if there's more than one container. If there's only one container, the
   * traffic is automatically forwarded there.
   */
  container?: Input<string>
  /**
   * The port and protocol to redirect the traffic to. Uses the format `{port}/{protocol}`.
   *
   * @example
   * ```js
   * {
   *   redirect: "80/http"
   * }
   * ```
   */
  redirect?: Input<Port>
  /**
   * @deprecated Use `conditions.path` instead.
   */
  path?: Input<string>
  /**
   * The conditions for the redirect. Only applicable to `http` and `https` protocols.
   */
  conditions?: Input<{
    /**
     * Configure path-based routing. Only requests matching the path are forwarded to
     * the container.
     *
     * ```js
     * {
     *   path: "/api/*"
     * }
     * ```
     *
     * The path pattern is case-sensitive, supports wildcards, and can be up to 128
     * characters.
     * - `*` matches 0 or more characters. For example, `/api/*` matches `/api/` or
     *   `/api/orders`.
     * - `?` matches exactly 1 character. For example, `/api/?.png` matches `/api/a.png`.
     *
     * @default Requests to all paths are forwarded.
     */
    path?: Input<string>
    /**
     * Configure query string based routing. Only requests matching one of the query
     * string conditions are forwarded to the container.
     *
     * Takes a list of `key`, the name of the query string parameter, and `value` pairs.
     * Where `value` is the value of the query string parameter. But it can be a pattern as well.
     *
     * If multiple `key` and `value` pairs are provided, it'll match requests with **any** of the
     * query string parameters.
     *
     * @default Query string is not checked when forwarding requests.
     *
     * @example
     *
     * For example, to match requests with query string `version=v1`.
     *
     * ```js
     * {
     *   query: [
     *     { key: "version", value: "v1" }
     *   ]
     * }
     * ```
     *
     * Or match requests with query string matching `env=test*`.
     *
     * ```js
     * {
     *   query: [
     *     { key: "env", value: "test*" }
     *   ]
     * }
     * ```
     *
     * Match requests with query string `version=v1` **or** `env=test*`.
     *
     * ```js
     * {
     *   query: [
     *     { key: "version", value: "v1" },
     *     { key: "env", value: "test*" }
     *   ]
     * }
     * ```
     *
     * Match requests with any query string key with value `example`.
     *
     * ```js
     * {
     *   query: [
     *     { value: "example" }
     *   ]
     * }
     * ```
     */
    query?: Input<
      Input<{
        /**
         * The name of the query string parameter.
         */
        key?: Input<string>
        /**
         * The value of the query string parameter.
         *
         * If no `key` is provided, it'll match any request where a query string parameter with
         * the given value exists.
         */
        value: Input<string>
      }>[]
    >
    /**
     * Configure header based routing. Only requests matching the header
     * name and values are forwarded to the container.
     *
     * Both the header name and values are case insensitive.
     *
     * @default Header is not checked when forwarding requests.
     *
     * @example
     *
     * For example, if you specify `X-Custom-Header` as the name and `Value1`
     * as a value, it will match requests with the header
     * `x-custom-header: value1` as well.
     *
     * ```js
     * {
     *   header: {
     *     name: "X-Custom-Header",
     *     values: ["Value1", "Value2", "Prefix*"]
     *   }
     * }
     * ```
     */
    header?: Input<{
      /**
       * The name of the HTTP header field to check. This is case-insensitive.
       */
      name: Input<string>

      /**
       * The values to match against the header value. The rule matches if the
       * request header matches any of these values. Values are case-insensitive
       * and support wildcards (`*` and `?`) for pattern matching.
       */
      values: Input<Input<string>>[]
    }>
  }>
}

export interface ServiceArgs extends FargateBaseArgs {
  /**
   * Configure a load balancer to route traffic to the containers.
   *
   * While you can expose a service through API Gateway, it's better to use a load balancer
   * for most traditional web applications. It is more expensive to start but at higher
   * levels of traffic it ends up being more cost effective.
   *
   * Also, if you need to listen on network layer protocols like `tcp` or `udp`, you have to
   * expose it through a load balancer.
   *
   * By default, the endpoint is an auto-generated load balancer URL. You can also add a
   * custom domain for the endpoint.
   *
   * @default Load balancer is not created
   * @example
   *
   * ```js
   * {
   *   loadBalancer: {
   *     domain: "example.com",
   *     rules: [
   *       { listen: "80/http", redirect: "443/https" },
   *       { listen: "443/https", forward: "80/http" }
   *     ]
   *   }
   * }
   * ```
   */
  loadBalancer?: Input<{
    domain?: Input<string>
    /** @deprecated Use `rules` instead. */
    ports?: Input<ServiceRules[]>

    health?: Input<
      Record<
        Port,
        Input<{
          path?: Input<string>
          interval?: Input<DurationMinutes>
          timeout?: Input<DurationMinutes>
          healthyThreshold?: Input<number>
          unhealthyThreshold?: Input<number>
          successCodes?: Input<string>
        }>
      >
    >
  }>
  scaling?: Input<{
    min?: Input<number>
    max?: Input<number>
    cpuUtilization?: Input<false | number>
    memoryUtilization?: Input<false | number>
    requestCount?: Input<false | number>
  }>
  capacity?: Input<{
    fargate?: Input<{
      /**
       * Start the first `base` number of tasks with the given capacity.
       *
       * :::caution
       * You can only specify `base` for one capacity provider.
       * :::
       */
      base?: Input<number>
      /**
       * Ensure the given ratio of tasks are started for this capacity.
       */
      weight: Input<number>
    }>
  }>
}

export class Service extends ComponentResource {
  private readonly _name: string
  private readonly _service?: Output<ecs.Service>
  private readonly executionRole?: iam.Role
  private readonly taskRole: iam.Role
  private readonly taskDefinition?: Output<ecs.TaskDefinition>
  private readonly loadBalancer?: lb.LoadBalancer
  private readonly autoScalingTarget?: appautoscaling.Target
  private readonly domain?: Output<string | undefined>
  private readonly _url?: Output<string>
  private readonly devUrl?: Output<string>

  constructor(
    name: string,
    args: ServiceArgs,
    opts: ComponentResourceOptions = {},
  ) {
    super('sst:aws:Service', name, args, opts)
    this._name = name

    const self = this

    const clusterArn = args.cluster.nodes.cluster.arn
    const clusterName = args.cluster.nodes.cluster.name
    const architecture = output('x86_64')
    const cpu = output(args.cpu!)
    const memory = output(args.memory!)
    const containers = normalizeContainers(args, name)
    const lbArgs = normalizeLoadBalancer()
    const scaling = normalizeScaling()
    const capacity = output(args.capacity!)
    const vpc = normalizeVpc()

    const taskRole = createTaskRole(name, args, opts, self)

    this.taskRole = taskRole

    const executionRole = createExecutionRole(name, args, opts, self)
    const taskDefinition = createTaskDefinition(
      name,
      args,
      opts,
      self,
      containers,
      architecture,
      cpu,
      memory,
      taskRole,
      executionRole,
    )
    const certificateArn = createSsl()
    const loadBalancer = createLoadBalancer()
    const targetGroups = createTargets()
    createListeners()
    const service = createService()
    const autoScalingTarget = createAutoScaling()
    createDnsRecords()

    this._service = output(service)
    this.executionRole = executionRole
    this.taskDefinition = output(taskDefinition)
    this.loadBalancer = loadBalancer
    this.autoScalingTarget = autoScalingTarget
    this.domain = lbArgs?.domain
      ? lbArgs.domain.apply((domain) => domain?.name)
      : output(undefined)
    this._url = !self.loadBalancer
      ? undefined
      : all([self.domain, self.loadBalancer?.dnsName]).apply(
          ([domain, loadBalancer]) =>
            domain ? `https://${domain}/` : `http://${loadBalancer}`,
        )

    function normalizeVpc() {
      // "vpc" is a Vpc component
      if (args.cluster.vpc instanceof Vpc) {
        const vpc = args.cluster.vpc
        return {
          isSstVpc: true,
          id: vpc.id,
          loadBalancerSubnets: lbArgs?.pub.apply((v) =>
            v ? vpc.publicSubnets : vpc.privateSubnets,
          ),
          containerSubnets: vpc.publicSubnets,
          securityGroups: vpc.securityGroups,
        }
      }

      // "vpc" is object
      return output(args.cluster.vpc).apply((vpc) => ({
        isSstVpc: false,
        ...vpc,
      }))
    }

    function normalizeScaling() {
      return all([lbArgs?.type, args.scaling]).apply(([type, v]) => {
        if (type !== 'application' && v?.requestCount)
          throw new Error(
            `Request count scaling is only supported for http/https protocols.`,
          )

        return {
          min: v?.min ?? 1,
          max: v?.max ?? 1,
          cpuUtilization: v?.cpuUtilization ?? 70,
          memoryUtilization: v?.memoryUtilization ?? 70,
          requestCount: v?.requestCount ?? false,
        }
      })
    }

    function normalizeLoadBalancer() {
      const loadBalancer = args.loadBalancer
      if (!loadBalancer) return

      // normalize rules
      const rules = all([loadBalancer, containers]).apply(
        ([lb, containers]) => {
          // validate rules
          const lbRules = lb.ports
          if (!lbRules || lbRules.length === 0)
            throw new Error(
              `You must provide the ports to expose via "loadBalancer.rules".`,
            )

          // validate container defined when multiple containers exists
          if (containers.length > 1) {
            lbRules.forEach((v) => {
              if (!v.container)
                throw new Error(
                  `You must provide a container name in "loadBalancer.rules" when there is more than one container.`,
                )
            })
          }

          // parse protocols and ports
          const rules = lbRules.map((v) => {
            const listenParts = v.listen.split('/')
            const listenPort = parseInt(listenParts[0])
            const listenProtocol = listenParts[1]
            const listenConditions =
              v.conditions || v.path
                ? {
                    path: v.conditions?.path ?? v.path,
                    query: v.conditions?.query,
                    header: v.conditions?.header,
                  }
                : undefined
            if (protocolType(listenProtocol) === 'network' && listenConditions)
              throw new Error(
                `Invalid rule conditions for listen protocol "${v.listen}". Only "http" protocols support conditions.`,
              )

            const redirectParts = v.redirect?.split('/')
            const redirectPort = redirectParts && parseInt(redirectParts[0])
            const redirectProtocol = redirectParts && redirectParts[1]
            if (redirectPort && redirectProtocol) {
              if (
                protocolType(listenProtocol) !== protocolType(redirectProtocol)
              )
                throw new Error(
                  `The listen protocol "${v.listen}" must match the redirect protocol "${v.redirect}".`,
                )
              return {
                type: 'redirect' as const,
                listenPort,
                listenProtocol,
                listenConditions,
                redirectPort,
                redirectProtocol,
              }
            }

            const forwardParts = v.forward ? v.forward.split('/') : listenParts
            const forwardPort = forwardParts && parseInt(forwardParts[0])
            const forwardProtocol = forwardParts && forwardParts[1]
            if (protocolType(listenProtocol) !== protocolType(forwardProtocol))
              throw new Error(
                `The listen protocol "${v.listen}" must match the forward protocol "${v.forward}".`,
              )
            return {
              type: 'forward' as const,
              listenPort,
              listenProtocol,
              listenConditions,
              forwardPort,
              forwardProtocol,
              container: v.container ?? containers[0].name,
            }
          })

          // validate protocols are consistent
          const appProtocols = rules.filter(
            (rule) => protocolType(rule.listenProtocol) === 'application',
          )
          if (appProtocols.length > 0 && appProtocols.length < rules.length)
            throw new Error(
              `Protocols must be either all http/https, or all tcp/udp/tcp_udp/tls.`,
            )

          // validate certificate exists for https/tls protocol
          rules.forEach((rule) => {
            if (['https', 'tls'].includes(rule.listenProtocol) && !lb.domain) {
              throw new Error(
                `You must provide a custom domain for ${rule.listenProtocol.toUpperCase()} protocol.`,
              )
            }
          })

          return rules
        },
      )

      // normalize domain
      const domain = output(loadBalancer).apply((lb) => {
        if (!lb.domain) return undefined

        // normalize domain
        const domain = { name: lb.domain }
        return {
          name: domain.name,
          aliases: [],
          dns: awsDns(),
          cert: undefined,
        }
      })

      // normalize type
      const type = output(rules).apply((rules) =>
        rules[0].listenProtocol.startsWith('http') ? 'application' : 'network',
      )

      // normalize public/private
      const pub = output(true)

      // normalize health check
      const health = all([type, rules, loadBalancer]).apply(
        ([type, rules, lb]) =>
          Object.fromEntries(
            Object.entries(lb?.health ?? {}).map(([k, v]) => {
              if (
                !rules.find(
                  (r) => `${r.forwardPort}/${r.forwardProtocol}` === k,
                )
              )
                throw new Error(
                  `Cannot configure health check for "${k}". Make sure it is defined in "loadBalancer.ports".`,
                )
              return [
                k,
                {
                  path: (v.path ?? type === 'application') ? '/' : undefined,
                  interval: v.interval ? toSeconds(v.interval) : 30,
                  timeout: v.timeout
                    ? toSeconds(v.timeout)
                    : type === 'application'
                      ? 5
                      : 6,
                  healthyThreshold: v.healthyThreshold ?? 5,
                  unhealthyThreshold: v.unhealthyThreshold ?? 2,
                  matcher: v.successCodes ?? '200',
                },
              ]
            }),
          ),
      )

      return { type, rules, domain, pub, health }
    }

    function createLoadBalancer() {
      if (!lbArgs) return

      const securityGroup = new ec2.SecurityGroup(
        `${name}LoadBalancerSecurityGroup`,
        {
          description: 'Managed by SST',
          vpcId: vpc.id,
          egress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: '-1',
              cidrBlocks: ['0.0.0.0/0'],
            },
          ],
          ingress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: '-1',
              cidrBlocks: ['0.0.0.0/0'],
            },
          ],
        },
        { parent: self },
      )

      return new lb.LoadBalancer(
        `${name}LoadBalancer`,
        {
          internal: lbArgs.pub.apply((v) => !v),
          loadBalancerType: lbArgs.type,
          subnets: vpc.loadBalancerSubnets,
          securityGroups: [securityGroup.id],
          enableCrossZoneLoadBalancing: true,
        },
        { parent: self },
      )
    }

    function createTargets() {
      if (!loadBalancer || !lbArgs) return

      return all([lbArgs.rules, lbArgs.health]).apply(([rules, health]) => {
        const targets: Record<string, lb.TargetGroup> = {}

        rules.forEach((r) => {
          if (r.type !== 'forward') return

          const container = r.container
          const forwardProtocol = r.forwardProtocol.toUpperCase()
          const forwardPort = r.forwardPort
          const targetId = `${container}${forwardProtocol}${forwardPort}`
          const target =
            targets[targetId] ??
            new lb.TargetGroup(
              `${name}Target${targetId}`,
              {
                // TargetGroup names allow for 32 chars, but an 8 letter suffix
                // ie. "-1234567" is automatically added.
                // - If we don't specify "name" or "namePrefix", we need to ensure
                //   the component name is less than 24 chars. Hard to guarantee.
                // - If we specify "name", we need to ensure the $app-$stage-$name
                //   if less than 32 chars. Hard to guarantee.
                // - Hence we will use "namePrefix".
                namePrefix: forwardProtocol,
                port: forwardPort,
                protocol: forwardProtocol,
                targetType: 'ip',
                vpcId: vpc.id,
                healthCheck: health[`${r.forwardPort}/${r.forwardProtocol}`],
              },
              { parent: self },
            )
          targets[targetId] = target
        })
        return targets
      })
    }

    function createListeners() {
      if (!lbArgs || !loadBalancer || !targetGroups) return

      return all([lbArgs.rules, targetGroups, certificateArn]).apply(
        ([rules, targets, cert]) => {
          // Group listeners by protocol and port
          // Because listeners with the same protocol and port but different path
          // are just rules of the same listener.
          const listenersById: Record<string, typeof rules> = {}
          rules.forEach((r) => {
            const listenProtocol = r.listenProtocol.toUpperCase()
            const listenPort = r.listenPort
            const listenerId = `${listenProtocol}${listenPort}`
            listenersById[listenerId] = listenersById[listenerId] ?? []
            listenersById[listenerId].push(r)
          })

          // Create listeners
          return Object.entries(listenersById).map(([listenerId, rules]) => {
            const listenProtocol = rules[0].listenProtocol.toUpperCase()
            const listenPort = rules[0].listenPort
            const defaultRule = rules.find((r) => !r.listenConditions)
            const customRules = rules.filter((r) => r.listenConditions)
            const buildActions = (r?: (typeof rules)[number]) => [
              ...(!r
                ? [
                    {
                      type: 'fixed-response',
                      fixedResponse: {
                        statusCode: '403',
                        contentType: 'text/plain',
                        messageBody: 'Forbidden',
                      },
                    },
                  ]
                : []),
              ...(r?.type === 'forward'
                ? [
                    {
                      type: 'forward',
                      targetGroupArn:
                        targets[
                          `${r.container}${r.forwardProtocol.toUpperCase()}${
                            r.forwardPort
                          }`
                        ].arn,
                    },
                  ]
                : []),
              ...(r?.type === 'redirect'
                ? [
                    {
                      type: 'redirect',
                      redirect: {
                        port: r.redirectPort.toString(),
                        protocol: r.redirectProtocol.toUpperCase(),
                        statusCode: 'HTTP_301',
                      },
                    },
                  ]
                : []),
            ]
            const listener = new lb.Listener(
              `${name}Listener${listenerId}`,
              {
                loadBalancerArn: loadBalancer.arn,
                port: listenPort,
                protocol: listenProtocol,
                certificateArn: ['HTTPS', 'TLS'].includes(listenProtocol)
                  ? cert
                  : undefined,
                defaultActions: buildActions(defaultRule),
              },
              { parent: self },
            )

            customRules.forEach(
              (r) =>
                new lb.ListenerRule(
                  `${name}Listener${listenerId}Rule${hashStringToPrettyString(
                    JSON.stringify(r.listenConditions),
                    4,
                  )}`,
                  {
                    listenerArn: listener.arn,
                    actions: buildActions(r),
                    conditions: [
                      {
                        pathPattern: r.listenConditions!.path
                          ? { values: [r.listenConditions!.path!] }
                          : undefined,
                        queryStrings: r.listenConditions!.query,
                        httpHeader: r.listenConditions!.header
                          ? {
                              httpHeaderName: r.listenConditions!.header.name,
                              values: r.listenConditions!.header.values,
                            }
                          : undefined,
                      },
                    ],
                  },
                  { parent: self },
                ),
            )

            return listener
          })
        },
      )
    }

    function createSsl() {
      if (!lbArgs) return output(undefined)

      return lbArgs.domain.apply((domain) => {
        if (!domain) return output(undefined)
        if (domain.cert) return output(domain.cert)

        return new DnsValidatedCertificate(
          `${name}Ssl`,
          {
            domainName: domain.name,
            alternativeNames: domain.aliases,
            dns: domain.dns!,
          },
          { parent: self },
        ).arn
      })
    }

    function createService() {
      return new ecs.Service(
        `${name}Service`,
        {
          name,
          cluster: clusterArn,
          taskDefinition: taskDefinition.arn,
          desiredCount: scaling.min,
          ...(capacity
            ? {
                // setting `forceNewDeployment` ensures that the service is not recreated
                // when the capacity provider config changes.
                forceNewDeployment: true,
                capacityProviderStrategies: capacity.apply((v) => [
                  ...(v.fargate
                    ? [
                        {
                          capacityProvider: 'FARGATE',
                          base: v.fargate?.base,
                          weight: v.fargate?.weight,
                        },
                      ]
                    : []),
                ]),
              }
            : // @deprecated do not use `launchType`, set `capacityProviderStrategies`
              // to `[{ capacityProvider: "FARGATE", weight: 1 }]` instead
              {
                launchType: 'FARGATE',
              }),
          networkConfiguration: {
            // If the vpc is an SST vpc, services are automatically deployed to the public
            // subnets. So we need to assign a public IP for the service to be accessible.
            assignPublicIp: vpc.isSstVpc,
            subnets: vpc.containerSubnets,
            securityGroups: vpc.securityGroups,
          },
          deploymentCircuitBreaker: {
            enable: true,
            rollback: true,
          },
          loadBalancers:
            lbArgs &&
            all([lbArgs.rules, targetGroups!]).apply(([rules, targets]) =>
              Object.values(targets).map((target) => ({
                targetGroupArn: target.arn,
                containerName: target.port.apply(
                  (port) =>
                    rules.find((r) => r.forwardPort === port)!.container!,
                ),
                containerPort: target.port.apply((port) => port!),
              })),
            ),
          enableExecuteCommand: true,
          // TODO: swain, make this true
          waitForSteadyState: false,
        },
        { parent: self },
      )
    }

    function createAutoScaling() {
      const target = new appautoscaling.Target(
        `${name}AutoScalingTarget`,
        {
          serviceNamespace: 'ecs',
          scalableDimension: 'ecs:service:DesiredCount',
          resourceId: interpolate`service/${clusterName}/${service.name}`,
          maxCapacity: scaling.max,
          minCapacity: scaling.min,
        },
        { parent: self },
      )

      output(scaling.cpuUtilization).apply((cpuUtilization) => {
        if (cpuUtilization === false) return
        new appautoscaling.Policy(
          `${name}AutoScalingCpuPolicy`,
          {
            serviceNamespace: target.serviceNamespace,
            scalableDimension: target.scalableDimension,
            resourceId: target.resourceId,
            policyType: 'TargetTrackingScaling',
            targetTrackingScalingPolicyConfiguration: {
              predefinedMetricSpecification: {
                predefinedMetricType: 'ECSServiceAverageCPUUtilization',
              },
              targetValue: cpuUtilization,
            },
          },
          { parent: self },
        )
      })

      output(scaling.memoryUtilization).apply((memoryUtilization) => {
        if (memoryUtilization === false) return
        new appautoscaling.Policy(
          `${name}AutoScalingMemoryPolicy`,
          {
            serviceNamespace: target.serviceNamespace,
            scalableDimension: target.scalableDimension,
            resourceId: target.resourceId,
            policyType: 'TargetTrackingScaling',
            targetTrackingScalingPolicyConfiguration: {
              predefinedMetricSpecification: {
                predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
              },
              targetValue: memoryUtilization,
            },
          },
          { parent: self },
        )
      })

      all([scaling.requestCount, targetGroups]).apply(
        ([requestCount, targetGroups]) => {
          if (requestCount === false) return
          if (!targetGroups) return

          const targetGroup = Object.values(targetGroups)[0]

          new appautoscaling.Policy(
            `${name}AutoScalingRequestCountPolicy`,
            {
              serviceNamespace: target.serviceNamespace,
              scalableDimension: target.scalableDimension,
              resourceId: target.resourceId,
              policyType: 'TargetTrackingScaling',
              targetTrackingScalingPolicyConfiguration: {
                predefinedMetricSpecification: {
                  predefinedMetricType: 'ALBRequestCountPerTarget',
                  resourceLabel: all([
                    loadBalancer?.arn,
                    targetGroup.arn,
                  ]).apply(([loadBalancerArn, targetGroupArn]) => {
                    // arn:...:loadbalancer/app/frank-MyServiceLoadBalan/005af2ad12da1e52
                    // => app/frank-MyServiceLoadBalan/005af2ad12da1e52
                    const lbPart = loadBalancerArn
                      ?.split(':')
                      .pop()
                      ?.split('/')
                      .slice(1)
                      .join('/')
                    // arn:...:targetgroup/HTTP20250103004618450100000001/e0811b8cf3a60762
                    // => targetgroup/HTTP20250103004618450100000001
                    const tgPart = targetGroupArn?.split(':').pop()
                    return `${lbPart}/${tgPart}`
                  }),
                },
                targetValue: requestCount,
              },
            },
            { parent: self },
          )
        },
      )

      return target
    }

    function createDnsRecords() {
      if (!lbArgs) return

      lbArgs.domain.apply((domain) => {
        if (!domain?.dns) return

        for (const recordName of [domain.name, ...domain.aliases]) {
          const namePrefix =
            recordName === domain.name ? name : `${name}${recordName}`
          domain.dns.createAlias(
            namePrefix,
            {
              name: recordName,
              aliasName: loadBalancer!.dnsName,
              aliasZone: loadBalancer!.zoneId,
            },
            { parent: self },
          )
        }
      })
    }
  }
}

function protocolType(protocol: string) {
  return ['http', 'https'].includes(protocol)
    ? ('application' as const)
    : ('network' as const)
}
