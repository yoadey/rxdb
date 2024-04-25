import assert from 'assert';

import config, { describeParallel } from './config.ts';
import {
    addRxPlugin,
    ensureNotFalsy,
    fillWithDefaultSettings,
    getPseudoSchemaForVersion,
    now,
    prepareQuery,
    randomCouchString
} from '../../plugins/core/index.mjs';

import {
    getRxStorageLoki,
    RxStorageInstanceLoki
} from '../../plugins/storage-lokijs/index.mjs';

import { waitUntil } from 'async-test-util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { LeaderElector } from 'broadcast-channel';
import {
    schemaObjects,
    schemas,
    humansCollection,
    isNode,
    isFastMode,
    HumanDocumentType,
    EXAMPLE_REVISION_1
} from '../../plugins/test-utils/index.mjs';
import { RxDBLeaderElectionPlugin } from '../../plugins/leader-election/index.mjs';
import { RxDBLocalDocumentsPlugin } from '../../plugins/local-documents/index.mjs';
import url from 'node:url';
/**
 * RxStorageLokiJS specific tests
 */
describe('rx-storage-lokijs.test.js', () => {
    if (config.storage.name !== 'lokijs') {
        return;
    }
    addRxPlugin(RxDBLeaderElectionPlugin);
    addRxPlugin(RxDBLocalDocumentsPlugin);
    describeParallel('RxDatabase', () => {
        it('create/write/remove', async () => {
            const collection = await humansCollection.create(
                10,
                randomCouchString(10),
                true,
                true,
                getRxStorageLoki()
            );
            const doc = await collection.findOne().exec(true);
            assert.ok(doc);

            const storageInstance: RxStorageInstanceLoki<HumanDocumentType> = collection.storageInstance as any;
            assert.ok(storageInstance.internals.leaderElector);

            await collection.database.destroy();
        });
        it('should work with 2 instances', async () => {
            const databaseName = randomCouchString(12);
            const col1 = await humansCollection.createMultiInstance(
                databaseName,
                0,
                undefined,
                getRxStorageLoki()
            );
            await col1.database.waitForLeadership();
            const col2 = await humansCollection.createMultiInstance(
                databaseName,
                0,
                undefined,
                getRxStorageLoki()
            );
            await col1.insert(schemaObjects.humanData());
            const doc2 = await col2.findOne().exec(true);
            assert.ok(doc2);
            const doc3 = await col1.findOne().exec(true);
            assert.ok(doc3);

            // the database storage of col2 should not have internal localState
            assert.ok(col1.database.internalStore.internals.localState);
            assert.ok(!col2.database.internalStore.internals.localState);

            /**
             * Only col1 should be leader
             * and so only col1 should have a localState.
             */
            assert.ok(col1.storageInstance.internals.localState);
            assert.ok(!col2.storageInstance.internals.localState);

            /**
             * The query on the non-leading instance
             * must return the correct query results.
             */
            await col2.insert(schemaObjects.humanData());
            await col1.insert(schemaObjects.humanData());
            await waitUntil(async () => {
                const res = await col2.find().exec();
                if (res.length > 3) {
                    throw new Error('got too much docs');
                }
                return res.length === 3;
            });

            col1.database.destroy();
            col2.database.destroy();
        });
        it('should not have localState if not leader', async () => {
            const databaseName = randomCouchString(12);
            const amount = 5;
            const cols = await Promise.all(
                new Array(amount).fill(0)
                    .map(() => humansCollection.createMultiInstance(
                        databaseName,
                        0,
                        undefined,
                        getRxStorageLoki()
                    ))
            );
            const getLeaders = () => {
                return cols.filter(col => {
                    const storageInstance = col.storageInstance;
                    const leaderElector: LeaderElector = storageInstance.internals.leaderElector;
                    return leaderElector.isLeader;
                });
            };

            // wait until one is leader
            await waitUntil(() => {
                const leaderAmount = getLeaders().length;
                if (leaderAmount > 1) {
                    throw new Error('duplicate leaders detected');
                } else if (leaderAmount === 1) {
                    return true;
                } else {
                    return false;
                }
            }, 50 * 1000, 200);

            // add some collections after leader is elected
            await Promise.all(
                new Array(amount).fill(0)
                    .map(async () => {
                        const col = await humansCollection.createMultiInstance(
                            databaseName,
                            0,
                            undefined,
                            getRxStorageLoki()
                        );
                        cols.push(col);
                    })
            );

            /**
             * Run some operations on non-leading instance
             * to emulate real world usage
             */
            const firstNonLeading = cols.find(col => !col.database.isLeader());
            if (!firstNonLeading) {
                throw new Error('no non leading instance');
            }
            await firstNonLeading.insert({
                passportId: randomCouchString(10),
                firstName: 'foo',
                lastName: 'bar',
                age: 10,
            });
            await firstNonLeading.insertLocal(
                randomCouchString(10),
                { foo: 'bar' }
            );

            /**
             * The non-leading instances should not
             * have localState set in its storage instances.
             */
            cols.forEach(col => {
                const mustHaveLocal = col.storageInstance.internals.leaderElector.isLeader;
                assert.strictEqual(mustHaveLocal, !!col.database.internalStore.internals.localState);
                assert.strictEqual(mustHaveLocal, !!col.storageInstance.internals.localState);
            });

            cols.forEach(col => col.database.destroy());
        });
        it('listening to queries must work', async () => {
            const databaseName = randomCouchString(12);
            const col1 = await humansCollection.createMultiInstance(
                databaseName,
                0,
                undefined,
                getRxStorageLoki()
            );
            await col1.database.waitForLeadership();
            const col2 = await humansCollection.createMultiInstance(
                databaseName,
                0,
                undefined,
                getRxStorageLoki()
            );
            let lastResult1: any[];
            let lastResult2: any[];

            const sub1 = col1.find().$.subscribe(res => lastResult1 = res);
            const sub2 = col1.find().$.subscribe(res => lastResult2 = res);

            await waitUntil(() => !!lastResult1 && !!lastResult2);

            await col2.insert(schemaObjects.humanData());
            await waitUntil(() => lastResult1.length === 1 && lastResult2.length === 1);

            sub1.unsubscribe();
            sub2.unsubscribe();
            col1.database.destroy();
            col2.database.destroy();
        });
        it('should use the given adapter', async () => {
            if (!isNode) {
                return;
            }
            /**
             * @link https://github.com/techfort/LokiJS/blob/master/tutorials/Persistence%20Adapters.md#an-example-using-fastest-and-most-scalable-lokifsstructuredadapter-for-nodejs-might-look-like-
             */
            const lfsa: any = await import('lokijs/src/loki-fs-structured-adapter.js');
            const adapter = new lfsa.default();
            const storage = getRxStorageLoki({
                adapter
            });

            const databaseName = 'lokijs-fs-adapter-test-' + randomCouchString(12);
            const __filename = url.fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const dbLocation = path.join(
                __dirname,
                '../',
                databaseName
            );

            const storageInstance = await storage.createStorageInstance<{ key: string; }>({
                databaseInstanceToken: randomCouchString(10),
                databaseName: dbLocation,
                collectionName: randomCouchString(12),
                schema: getPseudoSchemaForVersion(0, 'key'),
                options: {},
                multiInstance: false,
                devMode: true
            });

            const localState = await ensureNotFalsy(storageInstance.internals.localState);
            assert.ok(localState.databaseState.database.persistenceAdapter === adapter);
            const writeResponse = await storageInstance.bulkWrite([{
                document: {
                    key: 'foobar',
                    _deleted: false,
                    _rev: EXAMPLE_REVISION_1,
                    _meta: {
                        lwt: now()
                    },
                    _attachments: {}
                }
            }], 'loki-test');
            assert.deepStrictEqual(writeResponse.error, []);

            /**
             * It should have written the file to the filesystem
             * on the next autosave which is called on close()
             */
            await storageInstance.close();
            const exists = fs.existsSync(dbLocation + '.db');
            assert.ok(exists);
        });
        it('should have called the autosaveCallback', async () => {
            if (!isNode) {
                return;
            }
            const lfsa: any = await import('lokijs/src/loki-fs-structured-adapter.js');
            const adapter = new lfsa.default();

            let callbackCalledCount = 0;
            const storage = getRxStorageLoki({
                adapter,
                autosaveCallback: () => callbackCalledCount = callbackCalledCount + 1
            });
            const databaseName = 'lokijs-fs-test-autosaveCallback-' + randomCouchString(12);
            const __filename = url.fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const dbLocation = path.join(
                __dirname,
                '../',
                databaseName
            );
            const storageInstance = await storage.createStorageInstance<{ key: string; }>({
                databaseInstanceToken: randomCouchString(10),
                databaseName: dbLocation,
                collectionName: randomCouchString(12),
                schema: getPseudoSchemaForVersion(0, 'key'),
                options: {},
                multiInstance: false,
                devMode: true
            });

            await storageInstance.bulkWrite([{
                document: {
                    key: 'foobar',
                    _deleted: false,
                    _rev: EXAMPLE_REVISION_1,
                    _meta: {
                        lwt: now()
                    },
                    _attachments: {}
                }
            }], 'loki-test');

            await waitUntil(() => callbackCalledCount === 1);
            await storageInstance.close();
        });
    });
    describeParallel('issues', () => {
        /**
         * When the leading tab is set to cpu throttling mode by the browsers,
         * running setTimeout takes way longer then the given time.
         * Because LokiJS is in-memory, we elect a leader and all requests go to that leader.
         * This means when the leader is cpu-throttled, we have a really slow response.
         *
         * So in this test we assure that the internals of the LokiJS RxStorage
         * do not use any setTimeout call.
         *
         * @link https://github.com/pubkey/rxdb/issues/3666#issuecomment-1027801805
         */
        describe('#3666 RxDB with lokijs works bad in Safari and FF when using multiple tabs', () => {
            it('must not use setTimeout internally', async () => {
                if (
                    // run only on node to ensure that rewriting the setTimeout works properly.
                    !isNode ||
                    // do not run in fast mode because we overwrite global.setTimeout which break parallel tests.
                    isFastMode()
                ) {
                    return;
                }

                const oldSetTimeout = global.setTimeout;
                (global as any).setTimeout = (fn: Function, time: number) => {
                    throw new Error('LokiJS must not use setTimeout(' + fn.toString() + ', ' + time + ')');
                };

                const storage = getRxStorageLoki({
                    /**
                     * Do not set a persistence adapter.
                     * It is allowed to use setTimeout in the persistence
                     * because it is required to have it to determine when the database is idle.
                     * Also the persistence happens in the background so it is not that bad
                     * if the setTimeout takes longer because the browser throttled the tab.
                     */
                });

                const storageInstance = await storage.createStorageInstance({
                    databaseInstanceToken: randomCouchString(10),
                    databaseName: randomCouchString(12),
                    collectionName: randomCouchString(12),
                    multiInstance: false,
                    options: {},
                    schema: fillWithDefaultSettings(schemas.human),
                    devMode: true
                });

                const firstDocData = Object.assign(schemaObjects.humanData(), {
                    _deleted: false,
                    _meta: {
                        lwt: now()
                    },
                    _rev: EXAMPLE_REVISION_1,
                    _attachments: {}
                });
                await storageInstance.bulkWrite([
                    {
                        document: firstDocData
                    }
                ], 'loki-test');

                await storageInstance.bulkWrite([
                    {
                        document: Object.assign(schemaObjects.humanData(), {
                            _deleted: false,
                            _attachments: {},
                            _meta: {
                                lwt: now()
                            },
                            _rev: '1-51b2fae5721cc4d3cf7392f19e6cc118'
                        })
                    }
                ], 'loki-test');
                const preparedQuery = prepareQuery(
                    fillWithDefaultSettings(schemas.human),
                    {
                        selector: {},
                        sort: [{
                            passportId: 'asc'
                        }],
                        skip: 0
                    }
                );
                await storageInstance.query(preparedQuery);
                await storageInstance.findDocumentsById([firstDocData.passportId], false);

                await storageInstance.close();

                // reset the global.setTimeout so the following tests work properly.
                global.setTimeout = oldSetTimeout;
            });
        });
    });
    describeParallel('migration 11.x.x -> 12.0.0', () => {
        it('should move the $lastWriteAt value to _meta.lwt', async () => {
            if (!isNode) {
                return;
            }
            const lfsa: any = await import('lokijs/src/loki-fs-structured-adapter.js');
            const adapter = new lfsa.default();
            const storage = getRxStorageLoki({
                adapter
            });

            const databaseName = 'lokijs-migration-test-' + randomCouchString(12);
            const __filename = url.fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const dbLocation = path.join(
                __dirname,
                '../',
                databaseName
            );
            const collectionName = randomCouchString(12);
            const storageInstance = await storage.createStorageInstance<{ key: string; }>({
                databaseInstanceToken: randomCouchString(10),
                databaseName: dbLocation,
                collectionName,
                schema: getPseudoSchemaForVersion(0, 'key'),
                options: {},
                multiInstance: false,
                devMode: true
            });

            const key = 'foobar';
            const lwtValue = 1000;
            const localState = ensureNotFalsy(await storageInstance.internals.localState);
            localState.collection.insert({
                key,
                $lastWriteAt: lwtValue,
                _deleted: false,
                _attachments: {},
                _rev: '1-62080c42d471e3d2625e49dcca3b8e3e'
            });
            // manually trigger the save queue because we did a write to the internal loki db.
            await localState.databaseState.saveQueue.addWrite();

            await storageInstance.close();

            const storageInstance2 = await storage.createStorageInstance<{ key: string; }>({
                databaseInstanceToken: randomCouchString(10),
                databaseName: dbLocation,
                collectionName,
                schema: getPseudoSchemaForVersion(0, 'key'),
                options: {},
                multiInstance: false,
                devMode: true
            });

            const docFromStorage = await storageInstance2.findDocumentsById([key], true);
            const doc = ensureNotFalsy(docFromStorage[0]);

            assert.ok(doc._meta);
            assert.strictEqual(doc._meta.lwt, lwtValue);
            assert.ok(!Object.prototype.hasOwnProperty.call(doc, '$lastWriteAt'));

            storageInstance2.close();
        });
    });
});
