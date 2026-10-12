import { startListingWorker, type ListingWorkerScope } from './listingService'

startListingWorker(self as unknown as ListingWorkerScope)
