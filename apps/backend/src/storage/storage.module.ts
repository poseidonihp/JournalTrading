import { Global, Module } from '@nestjs/common';
import { LocalDiskDriver } from './local-disk.driver';
import { StorageDriver } from './storage.driver';

@Global()
@Module({
  providers: [LocalDiskDriver, { provide: StorageDriver, useExisting: LocalDiskDriver }],
  exports: [StorageDriver, LocalDiskDriver],
})
export class StorageModule {}
