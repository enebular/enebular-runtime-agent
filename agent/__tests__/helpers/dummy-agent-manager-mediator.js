import AgentManagerMediator from '../../src/agent-manager-mediator'

export default class AgentManagerMediatorMock extends AgentManagerMediator {

    async getInternalFileAssetDataUrl(key: string) {
        return 'https://hoge.hoge.com'
    }
}
  