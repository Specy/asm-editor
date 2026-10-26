import { prepareMarsRuntime } from '#lib/languages/mars/marsCheck.ts'
import { analyzeMarsProject } from '../adapters/marsAdapter'
import { startProjectWorker } from './projectWorkerServer'

startProjectWorker(async (sources, sessionId, revision, target) => {
    if (target !== 'MIPS' && target !== 'RISC-V' && target !== 'RISC-V-64') {
        throw new Error(`MARS/RARS Worker cannot analyze ${target}`)
    }
    await prepareMarsRuntime(sources, target)
    return analyzeMarsProject(sources, sessionId, revision, target)
})
