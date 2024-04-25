---
title: Dev-Mode Plugin
slug: dev-mode.html
---



# Dev Mode

The dev-mode plugin adds many checks and validations to RxDB.
This ensures that you use the RxDB API properly and so the dev-mode plugin should always be used when
using RxDB in development mode.

- Adds readable error messages.
- Ensures that `readonly` JavaScript objects are not accidentally mutated.
- Adds validation check for validity of schemas, queries, ORM methods and document fields.
  - Notice that the `dev-mode` plugin does not perform schema checks against the data see [schema validation](./schema-validation.md) for that.

:::warning
The dev-mode plugin will increase your build size and decrease the performance. It must **always** be used in development. You should **never** use it in production.
:::

```javascript
import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
addRxPlugin(RxDBDevModePlugin);
```

## Usage with Node.js

```ts
async function createDb() {
    if (process.env.NODE_ENV !== "production") {
        await import('rxdb/plugins/dev-mode').then(
            module => addRxPlugin(module.RxDBDevModePlugin)
        );
    }
    const db = createRxDatabase( /* ... */ );
}
```


## Usage with Angular

```ts
import { isDevMode } from '@angular/core';

async function createDb() {
    if (isDevMode()){
        await import('rxdb/plugins/dev-mode').then(
            module => addRxPlugin(module.RxDBDevModePlugin)
        );
    }

    const db = createRxDatabase( /* ... */ );
    // ...
}
```


## Usage with webpack

In the `webpack.config.js`:

```ts
module.exports = {
    entry: './src/index.ts',
    /* ... */
    plugins: [
        // set a global variable that can be accessed during runtime
        new webpack.DefinePlugin({ MODE: JSON.stringify("production") })
    ]
    /* ... */
};
```

In your source code:

```ts
declare var MODE: 'production' | 'development';

async function createDb() {
    if (MODE === 'development') {
        await import('rxdb/plugins/dev-mode').then(
            module => addRxPlugin(module.RxDBDevModePlugin)
        );
    }
    const db = createRxDatabase( /* ... */ );
    // ...
}

```



## Disable the dev-mode warning

When the dev-mode is enabled, it will print a `console.warn()` message to the console so that you do not accidentally use the dev-mode in production. To disable this warning you can call the `disableWarnings()` function.

```ts
import { disableWarnings } from 'rxdb/plugins/dev-mode';
disableWarnings();
```
