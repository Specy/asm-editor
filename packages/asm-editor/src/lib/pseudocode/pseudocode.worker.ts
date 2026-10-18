import { startPseudocodeWorker, type PseudocodeWorkerScope } from './pseudocodeService'

startPseudocodeWorker(self as unknown as PseudocodeWorkerScope)
