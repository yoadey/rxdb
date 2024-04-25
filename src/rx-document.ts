import {
    Observable
} from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    shareReplay,
    startWith
} from 'rxjs/operators';
import {
    clone,
    trimDots,
    pluginMissing,
    flatClone,
    PROMISE_RESOLVE_NULL,
    RXJS_SHARE_REPLAY_DEFAULTS,
    getProperty,
    getFromMapOrCreate
} from './plugins/utils/index.ts';
import {
    newRxError
} from './rx-error.ts';
import {
    runPluginHooks
} from './hooks.ts';

import type {
    RxDocument,
    RxCollection,
    RxDocumentData,
    RxDocumentWriteData,
    UpdateQuery,
    CRDTEntry,
    ModifyFunction
} from './types/index.d.ts';
import { getDocumentDataOfRxChangeEvent } from './rx-change-event.ts';
import { overwritable } from './overwritable.ts';
import { getSchemaByObjectPath } from './rx-schema-helper.ts';
import { throwIfIsStorageWriteError } from './rx-storage-helper.ts';
import { modifierFromPublicToInternal } from './incremental-write.ts';

export const basePrototype = {
    get primaryPath() {
        const _this: RxDocument = this as any;
        if (!_this.isInstanceOfRxDocument) {
            return undefined;
        }
        return _this.collection.schema.primaryPath;
    },
    get primary() {
        const _this: RxDocument = this as any;
        if (!_this.isInstanceOfRxDocument) {
            return undefined;
        }
        return (_this._data as any)[_this.primaryPath];
    },
    get revision() {
        const _this: RxDocument = this as any;
        if (!_this.isInstanceOfRxDocument) {
            return undefined;
        }
        return _this._data._rev;
    },
    get deleted$() {
        const _this: RxDocument<any> = this as any;
        if (!_this.isInstanceOfRxDocument) {
            return undefined;
        }
        return _this.$.pipe(
            map((d: any) => d._data._deleted)
        );
    },
    get deleted$$() {
        const _this: RxDocument = this as any;
        const reactivity = _this.collection.database.getReactivityFactory();
        return reactivity.fromObservable(
            _this.deleted$,
            _this.getLatest().deleted,
            _this.collection.database
        );
    },
    get deleted() {
        const _this: RxDocument = this as any;
        if (!_this.isInstanceOfRxDocument) {
            return undefined;
        }
        return _this._data._deleted;
    },

    getLatest(this: RxDocument): RxDocument {
        const latestDocData = this.collection._docCache.getLatestDocumentData(this.primary);
        return this.collection._docCache.getCachedRxDocument(latestDocData);
    },

    /**
     * returns the observable which emits the plain-data of this document
     */
    get $(): Observable<RxDocumentData<any>> {
        const _this: RxDocument<{}, {}, {}> = this as any;
        return _this.collection.$.pipe(
            filter(changeEvent => !changeEvent.isLocal),
            filter(changeEvent => changeEvent.documentId === this.primary),
            map(changeEvent => getDocumentDataOfRxChangeEvent(changeEvent)),
            startWith(_this.collection._docCache.getLatestDocumentData(this.primary)),
            distinctUntilChanged((prev, curr) => prev._rev === curr._rev),
            map(docData => (this as RxDocument<any>).collection._docCache.getCachedRxDocument(docData)),
            shareReplay(RXJS_SHARE_REPLAY_DEFAULTS)
        );
    },
    get $$(): any {
        const _this: RxDocument = this as any;
        const reactivity = _this.collection.database.getReactivityFactory();
        return reactivity.fromObservable(
            _this.$,
            _this.getLatest()._data,
            _this.collection.database
        );
    },

    /**
     * returns observable of the value of the given path
     */
    get$(this: RxDocument, path: string): Observable<any> {
        if (overwritable.isDevMode()) {
            if (path.includes('.item.')) {
                throw newRxError('DOC1', {
                    path
                });
            }

            if (path === this.primaryPath) {
                throw newRxError('DOC2');
            }

            // final fields cannot be modified and so also not observed
            if (this.collection.schema.finalFields.includes(path)) {
                throw newRxError('DOC3', {
                    path
                });
            }

            const schemaObj = getSchemaByObjectPath(
                this.collection.schema.jsonSchema,
                path
            );

            if (!schemaObj) {
                throw newRxError('DOC4', {
                    path
                });
            }
        }

        return this.$
            .pipe(
                map(data => getProperty(data, path)),
                distinctUntilChanged()
            );
    },
    get$$(this: RxDocument, path: string) {
        const obs = this.get$(path);
        const reactivity = this.collection.database.getReactivityFactory();
        return reactivity.fromObservable(
            obs,
            this.getLatest().get(path),
            this.collection.database
        );
    },

    /**
     * populate the given path
     */
    populate(this: RxDocument, path: string): Promise<RxDocument | null> {
        const schemaObj = getSchemaByObjectPath(
            this.collection.schema.jsonSchema,
            path
        );
        const value = this.get(path);
        if (!value) {
            return PROMISE_RESOLVE_NULL;
        }
        if (!schemaObj) {
            throw newRxError('DOC5', {
                path
            });
        }
        if (!schemaObj.ref) {
            throw newRxError('DOC6', {
                path,
                schemaObj
            });
        }

        const refCollection: RxCollection = this.collection.database.collections[schemaObj.ref];
        if (!refCollection) {
            throw newRxError('DOC7', {
                ref: schemaObj.ref,
                path,
                schemaObj
            });
        }

        if (schemaObj.type === 'array') {
            return refCollection.findByIds(value).exec().then(res => {
                const valuesIterator = res.values();
                return Array.from(valuesIterator) as any;
            });
        } else {
            return refCollection.findOne(value).exec();
        }
    },
    /**
     * get data by objectPath
     * @hotPath Performance here is really important,
     * run some tests before changing anything.
     */
    get(this: RxDocument, objPath: string): any | null {
        return getFromMapOrCreate(
            this._propertyCache,
            objPath,
            () => {
                const valueObj = getProperty(this._data, objPath);

                // direct return if array or non-object
                if (
                    typeof valueObj !== 'object' ||
                    valueObj === null ||
                    Array.isArray(valueObj)
                ) {
                    return overwritable.deepFreezeWhenDevMode(valueObj);
                }
                const _this = this;
                const proxy = new Proxy(
                    /**
                     * In dev-mode, the _data is deep-frozen
                     * so we have to flat clone here so that
                     * the proxy can work.
                     */
                    flatClone(valueObj),
                    {
                        get(target, property: any) {
                            if (typeof property !== 'string') {
                                return target[property];
                            }
                            const lastChar = property.charAt(property.length - 1);
                            if (property.endsWith('$$')) {
                                const key = property.slice(0, -2);
                                return _this.get$$(trimDots(objPath + '.' + key));
                            } else if (lastChar === '$') {
                                const key = property.slice(0, -1);
                                return _this.get$(trimDots(objPath + '.' + key));
                            } else if (lastChar === '_') {
                                const key = property.slice(0, -1);
                                return _this.populate(trimDots(objPath + '.' + key));
                            } else {
                                return _this.get(trimDots(objPath + '.' + property));
                            }
                        }
                    });
                return proxy;
            }
        );

    },

    toJSON(this: RxDocument, withMetaFields = false) {
        if (!withMetaFields) {
            const data = flatClone(this._data);
            delete (data as any)._rev;
            delete (data as any)._attachments;
            delete (data as any)._deleted;
            delete (data as any)._meta;
            return overwritable.deepFreezeWhenDevMode(data);
        } else {
            return overwritable.deepFreezeWhenDevMode(this._data);
        }
    },
    toMutableJSON(this: RxDocument, withMetaFields = false) {
        return clone(this.toJSON(withMetaFields as any));
    },

    /**
     * updates document
     * @overwritten by plugin (optional)
     * @param updateObj mongodb-like syntax
     */
    update(_updateObj: UpdateQuery<any>) {
        throw pluginMissing('update');
    },
    incrementalUpdate(_updateObj: UpdateQuery<any>) {
        throw pluginMissing('update');
    },
    updateCRDT(_updateObj: CRDTEntry<any> | CRDTEntry<any>[]) {
        throw pluginMissing('crdt');
    },
    putAttachment() {
        throw pluginMissing('attachments');
    },
    getAttachment() {
        throw pluginMissing('attachments');
    },
    allAttachments() {
        throw pluginMissing('attachments');
    },
    get allAttachments$() {
        throw pluginMissing('attachments');
    },

    async modify<RxDocType>(
        this: RxDocument<RxDocType>,
        mutationFunction: ModifyFunction<RxDocType>,
        // used by some plugins that wrap the method
        _context?: string
    ): Promise<RxDocument> {
        const oldData = this._data;
        const newData: RxDocumentData<RxDocType> = await modifierFromPublicToInternal<RxDocType>(mutationFunction)(oldData) as any;
        return this._saveData(newData, oldData) as any;
    },

    /**
     * runs an incremental update over the document
     * @param function that takes the document-data and returns a new data-object
     */
    incrementalModify(
        this: RxDocument,
        mutationFunction: ModifyFunction<any>,
        // used by some plugins that wrap the method
        _context?: string
    ): Promise<RxDocument> {
        return this.collection.incrementalWriteQueue.addWrite(
            this._data,
            modifierFromPublicToInternal(mutationFunction)
        ).then(result => this.collection._docCache.getCachedRxDocument(result));
    },

    patch<RxDocType>(
        this: RxDocument<RxDocType>,
        patch: Partial<RxDocType>
    ) {
        const oldData = this._data;
        const newData = clone(oldData);
        Object
            .entries(patch)
            .forEach(([k, v]) => {
                (newData as any)[k] = v;
            });
        return this._saveData(newData, oldData);
    },

    /**
     * patches the given properties
     */
    incrementalPatch<RxDocumentType = any>(
        this: RxDocument<RxDocumentType>,
        patch: Partial<RxDocumentType>
    ): Promise<RxDocument<RxDocumentType>> {
        return this.incrementalModify((docData) => {
            Object
                .entries(patch)
                .forEach(([k, v]) => {
                    (docData as any)[k] = v;
                });
            return docData;
        });
    },

    /**
     * saves the new document-data
     * and handles the events
     */
    async _saveData<RxDocType>(
        this: RxDocument<RxDocType>,
        newData: RxDocumentWriteData<RxDocType>,
        oldData: RxDocumentData<RxDocType>
    ): Promise<RxDocument<RxDocType>> {
        newData = flatClone(newData);

        // deleted documents cannot be changed
        if (this._data._deleted) {
            throw newRxError('DOC11', {
                id: this.primary,
                document: this
            });
        }
        await beforeDocumentUpdateWrite(this.collection, newData, oldData);
        const writeResult = await this.collection.storageInstance.bulkWrite([{
            previous: oldData,
            document: newData
        }], 'rx-document-save-data');

        const isError = writeResult.error[0];
        throwIfIsStorageWriteError(this.collection, this.primary, newData, isError);

        await this.collection._runHooks('post', 'save', newData, this);
        return this.collection._docCache.getCachedRxDocument(
            writeResult.success[0]
        );
    },

    /**
     * Remove the document.
     * Notice that there is no hard delete,
     * instead deleted documents get flagged with _deleted=true.
     */
    remove(this: RxDocument): Promise<RxDocument> {
        const collection = this.collection;
        if (this.deleted) {
            return Promise.reject(newRxError('DOC13', {
                document: this,
                id: this.primary
            }));
        }

        const deletedData = flatClone(this._data);
        let removedDocData: RxDocumentData<any>;
        return collection._runHooks('pre', 'remove', deletedData, this)
            .then(async () => {
                deletedData._deleted = true;
                const writeResult = await collection.storageInstance.bulkWrite([{
                    previous: this._data,
                    document: deletedData
                }], 'rx-document-remove');
                const isError = writeResult.error[0];
                throwIfIsStorageWriteError(collection, this.primary, deletedData, isError);
                return writeResult.success[0];
            })
            .then((removed) => {
                removedDocData = removed;
                return this.collection._runHooks('post', 'remove', deletedData, this);
            })
            .then(() => {
                return this.collection._docCache.getCachedRxDocument(removedDocData);
            });
    },
    incrementalRemove(this: RxDocument): Promise<RxDocument> {
        return this.incrementalModify(async (docData) => {
            await this.collection._runHooks('pre', 'remove', docData, this);
            docData._deleted = true;
            return docData;
        }).then(async (newDoc) => {
            await this.collection._runHooks('post', 'remove', newDoc._data, newDoc);
            return newDoc;
        });
    },
    destroy() {
        throw newRxError('DOC14');
    }
};

export function createRxDocumentConstructor(proto = basePrototype) {
    const constructor = function RxDocumentConstructor(
        this: RxDocument,
        collection: RxCollection,
        docData: RxDocumentData<any>
    ) {
        this.collection = collection;

        // assume that this is always equal to the doc-data in the database
        this._data = docData;
        this._propertyCache = new Map<string, any>();

        /**
         * because of the prototype-merge,
         * we can not use the native instanceof operator
         */
        this.isInstanceOfRxDocument = true;
    };
    constructor.prototype = proto;
    return constructor;
}

export function createWithConstructor<RxDocType>(
    constructor: any,
    collection: RxCollection<RxDocType>,
    jsonData: RxDocumentData<RxDocType>
): RxDocument<RxDocType> | null {
    const doc = new constructor(collection, jsonData);
    runPluginHooks('createRxDocument', doc);
    return doc;
}

export function isRxDocument(obj: any): boolean {
    return typeof obj === 'object' && obj !== null && 'isInstanceOfRxDocument' in obj;
}


export function beforeDocumentUpdateWrite<RxDocType>(
    collection: RxCollection<RxDocType>,
    newData: RxDocumentWriteData<RxDocType>,
    oldData: RxDocumentData<RxDocType>
): Promise<any> {
    /**
     * Meta values must always be merged
     * instead of overwritten.
     * This ensures that different plugins do not overwrite
     * each others meta properties.
     */
    newData._meta = Object.assign(
        {},
        oldData._meta,
        newData._meta
    );

    // ensure modifications are ok
    if (overwritable.isDevMode()) {
        collection.schema.validateChange(oldData, newData);
    }
    return collection._runHooks('pre', 'save', newData, oldData);
}

