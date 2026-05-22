import '@/generated/agent-job-contracts'

// TODO(ENG-7535): Drop this augmentation once compliance_setup is registered
// in the PMF engine's EXPERIMENT_REGISTRY and its manifest is published to the
// agent-experiment-metadata-{env} bucket — the codegen at
// scripts/generate-agent-job-types.ts will then produce this entry directly.
declare module '@/generated/agent-job-contracts' {
  interface AgentJobContracts {
    compliance_setup: {
      Input: {
        campaignId: number
        tcrComplianceId: string
      }
      Output: Record<string, never>
    }
  }
}
