import { startSearchWorker, type SearchWorkerScope } from './searchWorker.ts'

startSearchWorker(self as unknown as SearchWorkerScope)
