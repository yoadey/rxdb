---
title: Node.js Filesystem RxStorage 👑
slug: rx-storage-filesystem-node.html
---

# Filesystem Node RxStorage (beta)

The Filesystem Node [RxStorage](./rx-storage.md) for RxDB is built on top of the [Node.js Filesystem API](https://nodejs.org/api/fs.html).
It stores data in plain json/txt files like any "normal" database does. It is a bit faster compared to the [SQLite storage](./rx-storage-sqlite.md) and its setup is less complex.
Using the same database folder in parallel with multiple Node.js processes is supported when you set `multiInstance: true` while creating the [RxDatabase](./rx-database.md).


### Pros

- Easier setup compared to SQLite
- Fast

### Cons

- It is part of the [RxDB Premium 👑](/premium) plugin that must be purchased.
- It is in beta mode at the moment which means it can include breaking changes without a RxDB major version increment.

<p align="center">
  <img src="./files/rx-storage-performance-node.png" alt="RxStorage performance - Node.js" width="700" />
</p>


## Usage

```ts
import {
    createRxDatabase
} from 'rxdb';
import { getRxStorageFilesystemNode } from 'rxdb-premium/plugins/storage-filesystem-node';

const myRxDatabase = await createRxDatabase({
    name: 'exampledb',
    storage: getRxStorageFilesystemNode({
        basePath: path.join(__dirname, 'my-database-folder'),
        /**
         * Set inWorker=true if you use this RxStorage
         * together with the WebWorker plugin.
         */
        inWorker: false
    })
});
/* ... */
```
