import { analyzeZ80Project } from '../adapters/z80Adapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker((sources, sessionId, revision, target) => {
    if (target !== 'Z80') throw new Error(`Z80 Worker cannot analyze ${target}`)
    return analyzeZ80Project(sources, sessionId, revision)
})
