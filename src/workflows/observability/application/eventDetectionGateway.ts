import {
  eventApi,
  type EventChatRequest,
  type EventRuleCreate,
  type SimulationRequest,
} from '@/domains/text2sql/api/events'

export const eventDetectionGateway = {
  chat: (request: EventChatRequest) => eventApi.chat(request),
  createRule: (request: EventRuleCreate) => eventApi.createRule(request),
  listRules: () => eventApi.listRules(),
  getCepStatus: () => eventApi.getCepStatus(),
  deleteRule: (ruleId: string) => eventApi.deleteRule(ruleId),
  toggleRule: (ruleId: string) => eventApi.toggleRule(ruleId),
  runSimulation: (request: SimulationRequest) => eventApi.runSimulation(request),
}
