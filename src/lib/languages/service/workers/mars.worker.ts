import { analyzeMarsProject } from '../adapters/marsAdapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker((sources, sessionId, revision, target) => {
    if (target !== 'MIPS' && target !== 'RISC-V' && target !== 'RISC-V-64') {
        throw new Error(`MARS/RARS Worker cannot analyze ${target}`)
    }
    return analyzeMarsProject(sources, sessionId, revision, target)
})
