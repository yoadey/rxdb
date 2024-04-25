---
title: Encryption
slug: encryption.html
description: Explore RxDB's 🔒 encryption plugin for enhanced data security in web and native apps, featuring password-based encryption and secure storage.
---



# 🔒 Encrypted Local Storage with RxDB


<!-- keywords:
encrypted browser storage
secure web storage
encrypt local storage
indexeddb encryption
sqlite browser encrypted databases
react native encrypted storage
-->


The RxDB encryption plugin empowers developers to fortify their applications' data security. It seamlessly integrates with [RxDB](https://rxdb.info/), allowing for the secure storage and retrieval of documents by **encrypting them with a password**. With encryption and decryption processes handled internally, it ensures that sensitive data remains confidential, making it a valuable tool for building robust, privacy-conscious applications. The encryption works on all RxDB supported devices types like the **browser**, **ReactNative** or **Node.js**.

<p align="center">
  <img src="./files/icons/with-gradient/storage-layer.svg" alt="Encryption Storage Layer" height="60" />
</p>

Encrypting client-side stored data in RxDB offers numerous advantages:
- **Enhanced Security**: In the unfortunate event of a user's device being stolen, the encrypted data remains safeguarded on the hard drive, inaccessible without the correct password.
- **Access Control**: You can retain control over stored data by revoking access at any time simply by withholding the password.
- **Tamper proof** Other applications on the device cannot read out the stored data when the password is only kept in the process-specific memory


## Querying encrypted data

RxDB handles the encryption and decryption of data internally. This means that when you work with a RxDocument, you can access the properties of the document just like you would with normal, unencrypted data. RxDB automatically decrypts the data for you when you retrieve it, making it transparent to your application code.
This means the encryption works with all [RxStorage](./rx-storage.md) like **SQLite**, **IndexedDB**, **OPFS** and so on.

However, there's a limitation when it comes to querying encrypted fields. **Encrypted fields cannot be used as operators in queries**. This means you cannot perform queries like "find all documents where the encrypted field equals a certain value." RxDB does not expose the encrypted data in a way that allows direct querying based on the encrypted content. To filter or search for documents based on the contents of encrypted fields, you would need to first decrypt the data and then perform the query, which might not be efficient or practical in some cases.
You could however use the [memory synced](./rx-storage-memory-synced.md) RxStorage to replicate the encrypted documents into a non-encrypted in-memory storage and then query them like normal.

## Password handling
RxDB does not define how you should store or retrieve the encryption password. It only requires you to provide the password on database creation which grants you flexibility in how you manage encryption passwords.
You could ask the user on app-start to insert the password, or you can retrieve the password from your backend on app start (or revoke access by no longer providing the password).

## Asymmetric encryption

The encryption plugin itself uses **symmetric encryption** with a password to guarantee best performance when reading and storing data.
It is not able to do **Asymmetric encryption** by itself. If you need Asymmetric encryption with a private/publicKey, it is recommended to encrypted the password itself with the asymentric keys and store the encrypted password beside the other data. On app-start you can decrypt the password with the private key and use the decrypted passwort in the RxDB encryption plugin


## Using the RxDB Encryption Plugins


RxDB currently has two plugins for encryption:

- The free `encryption-crypto-js` plugin that is based on the `AES` algorithm of the [crypto-js](https://www.npmjs.com/package/crypto-js) library
- The [👑 premium](/premium) `encryption-web-crypto` plugin that is based on the native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) which makes it faster and more secure to use. Document inserts are about 10x faster compared to `crypto-js` and it has a smaller build size because it uses the browsers API instead of bundling an npm module.

An RxDB encryption plugin is a wrapper around any other [RxStorage](./rx-storage.md). 

- You first have to wrap your RxStorage with the encryption
- Then use that as `RxStorage` when calling `createRxDatabase()`
- Also you have to set a **password** when creating the database. The format of the password depends on which encryption plugin is used.
- To define a field as being encrypted, you have to add it to the `encrypted` fields list in the schema.

```ts
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';


// wrap the normal storage with the encryption plugin
const encryptedDexieStorage = wrappedKeyEncryptionCryptoJsStorage({
    storage: getRxStorageDexie()
});

// create an encrypted database
const db = await createRxDatabase({
    name: 'mydatabase',
    storage: encryptedDexieStorage,
    password: 'sudoLetMeIn'
});


const schema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
      id: {
          type: 'string',
          maxLength: 100
      },
      secret: {
          type: 'string'
      },
  },
  required: ['id']
  encrypted: ['secret']
};

await db.addCollections({
    myDocuments: {
        schema
    }
})
/* ... */
```

Or with the `web-crypto` [👑 premium](./premium) plugin:

```ts
import {
    wrappedKeyEncryptionWebCryptoStorage,
    createPassword
} from 'rxdb-premium/plugins/encryption-web-crypto';
import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/storage-indexeddb';

// wrap the normal storage with the encryption plugin
const encryptedIndexedDbStorage = wrappedKeyEncryptionWebCryptoStorage({
    storage: getRxStorageIndexedDB()
});

const myPasswordObject = {
    // Algorithm can be oneOf: 'AES-CTR' | 'AES-CBC' | 'AES-GCM'
    algorithm: 'AES-CTR',
    password: 'myRandomPasswordWithMin8Length'
};

// create an encrypted database
const db = await createRxDatabase({
    name: 'mydatabase',
    storage: encryptedIndexedDbStorage,
    password: myPasswordObject
});

/* ... */
```

## Changing the password

The password is set database specific and it is not possible to change the password of a database. Opening an existing database with a different password will throw an error. To change the password you can either:
- Use the [storage migration plugin](./migration-storage.md) to migrate the database state into a new database.
- Store a randomly created meta-password in a different RxDatabase as a value of a [local document](./rx-local-document.md). Encrypt the meta password with the actual user password and read it out before creating the actual database.

## Encrypted attachments

To store the [attachments](./rx-attachment.md) data encrypted, you have to set `encrypted: true` in the `attachments` property of the schema.

```ts
const mySchema = {
    version: 0,
    type: 'object',
    properties: {
        /* ... */
    },
    attachments: {
        encrypted: true // if true, the attachment-data will be encrypted with the db-password
    }
};
```
