import type { RxStorage, RxStorageInstanceCreationParams } from '../../types/index.d.ts';
import type { DenoKVSettings, DenoKVStorageInternals } from './denokv-types.ts';
import { RxStorageInstanceDenoKV } from "./rx-storage-instance-denokv.ts";
export declare class RxStorageDenoKV implements RxStorage<DenoKVStorageInternals<any>, DenoKVSettings> {
    settings: DenoKVSettings;
    name: string;
    statics: Readonly<{
        prepareQuery<RxDocType>(schema: import("../../types/rx-schema").RxJsonSchema<import("../../types/rx-storage").RxDocumentData<RxDocType>>, mutateableQuery: import("../../types/rx-storage.interface").FilledMangoQuery<RxDocType>): any;
        checkpointSchema: import("../../types/util").DeepReadonlyObject<import("../../types/rx-schema").JsonSchema>;
    }>;
    constructor(settings: DenoKVSettings);
    createStorageInstance<RxDocType>(params: RxStorageInstanceCreationParams<RxDocType, DenoKVSettings>): Promise<RxStorageInstanceDenoKV<RxDocType>>;
}
export declare function getRxStorageDenoKV(settings?: DenoKVSettings): RxStorageDenoKV;