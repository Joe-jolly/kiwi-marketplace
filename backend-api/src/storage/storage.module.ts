import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Shared infrastructure module, outside feature folders, following the
// pattern established by `PrismaModule` (ADR-001 / ADR-005): any feature
// that needs R2 access injects `StorageService` without importing this
// module explicitly.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
