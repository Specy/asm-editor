import { analyzeMarsProject, prepareMarsAnalysis } from '../adapters/marsAdapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker(async (sources, sessionId, revision, target) => {
    if (target !== 'MIPS' && target !== 'RISC-V' && target !== 'RISC-V-64') {
        throw new Error(`MARS/RARS Worker cannot analyze ${target}`)
    }
    await prepareMarsAnalysis(sources, target)
    return analyzeMarsProject(sources, sessionId, revision, target)
})
