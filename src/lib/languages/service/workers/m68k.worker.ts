import { analyzeM68kProject } from '../adapters/m68kAdapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker((sources, sessionId, revision, target) => {
    if (target !== 'M68K') throw new Error(`M68K Worker cannot analyze ${target}`)
    return analyzeM68kProject(sources, sessionId, revision)
})
