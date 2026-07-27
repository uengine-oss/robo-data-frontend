import {
  agentSchedulerApi,
  processGptApi,
  type CreateAgentProfileRequest,
} from '@/domains/agent-scheduler'
import { whatifDomainApi } from '@/domains/ontology'

export const watchAgentGateway = {
  listProfiles: () => agentSchedulerApi.listProfiles(),
  createProfile: (request: CreateAgentProfileRequest) => (
    agentSchedulerApi.createProfile(request)
  ),
  toggleProfile: (profileId: string) => agentSchedulerApi.toggleProfile(profileId),
  deleteProfile: (profileId: string) => agentSchedulerApi.deleteProfile(profileId),
  testProfile: (profileId: string) => agentSchedulerApi.testProfile(profileId),
  debugProfile: (profileId: string) => agentSchedulerApi.debugProfile(profileId),
  listProcesses: () => processGptApi.listProcesses(),
  listScenarioProfiles: () => whatifDomainApi.listScenarioProfiles(),
}
