import AgentManagerMediator from '../../src/agent-manager-mediator'

export default class AgentManagerMediatorMock extends AgentManagerMediator {

    _errorInjection = false

    async getInternalFileAssetDataUrl(key: string) {
        if(this._errorInjection === true) {
            throw new Error('error injection: getInternalFileAssetDataUrl')
        }
        return 'https://hoge.hoge.com'
    }

    __setErrorInjection(enable) {
        this._errorInjection = enable
    }
}
  