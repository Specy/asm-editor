import { analyzeX86Project } from '../adapters/x86Adapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker((sources, sessionId, revision, target) => {
    if (target !== 'X86') throw new Error(`x86 Worker cannot analyze ${target}`)
    return analyzeX86Project(sources, sessionId, revision)
})
