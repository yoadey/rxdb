import type {
    RxQueryBase
} from '../rx-query.d.ts';
import type { Paths, StringKeys } from './util.d.ts';

/**
 * Typed Mango Query Selector
 * @link https://github.com/mongodb/node-mongodb-native/blob/26bce4a8debb65df5a42dc8599e886c9c83de10d/src/mongo_types.ts
 * @link https://stackoverflow.com/a/58436959/3443137
 */


export type PropertyType<Type, Property extends string> = string extends Property
    ? unknown
    : Property extends keyof Type
    ? Type[Property]
    : Property extends `${number}`
    ? Type extends ReadonlyArray<infer ArrayType>
    ? ArrayType
    : unknown
    : Property extends `${infer Key}.${infer Rest}`
    ? Key extends `${number}`
    ? Type extends ReadonlyArray<infer ArrayType>
    ? PropertyType<ArrayType, Rest>
    : unknown
    : Key extends keyof Type
    ? Type[Key] extends Map<string, infer MapType>
    ? MapType
    : PropertyType<Type[Key], Rest>
    : unknown
    : unknown;


export type MangoQueryRegexOptions = 'i' | 'g' | 'm' | 'gi' | 'ig' | 'igm' | string;

/*
 * The MongoDB query library is huge and we do not need all the operators.
 * If you add an operator here, make sure that you properly add a test in
 * the file /test/unit/rx-storage-query-correctness.test.ts
 *
 * @link https://github.com/kofrasa/mingo#es6
 */
export interface MangoQueryOperators<PathValueType> {
    $eq?: PathValueType;
    $gt?: PathValueType;
    $gte?: PathValueType;
    $lt?: PathValueType;
    $lte?: PathValueType;
    $ne?: PathValueType;
    $in?: PathValueType[];
    $nin?: PathValueType[];
    $regex?: string;
    $options?: MangoQueryRegexOptions;
    $exists?: boolean;
    $type?: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
    $mod?: number;
    $not?: PathValueType;
    $size?: number;
    $elemMatch?: MangoQuerySelector<PathValueType>;
}

export type MangoQuerySelector<DocType> = Partial<{
    [Property in Paths<DocType>]: MangoQueryOperators<any> | PropertyType<DocType, Property>;
}> & {
    $and?: MangoQuerySelector<DocType>[];
    $or?: MangoQuerySelector<DocType>[];
    $nor?: MangoQuerySelector<DocType>[];
};

/**
 * Discussion was at:
 * @link https://github.com/pubkey/rxdb/issues/1972
 */
export type MangoQuerySortDirection = 'asc' | 'desc';
export type MangoQuerySortPart<RxDocType = any> = {
    [k in StringKeys<RxDocType> | string]: MangoQuerySortDirection;
};

export type MangoQuerySelectorAndIndex<RxDocType = any> = {
    /**
     * Selector is optional,
     * if not given, the query matches all documents
     * that are not _deleted=true.
     */
    selector?: MangoQuerySelector<RxDocType>;
    /**
     * By default, the RxStorage implementation
     * decides which index to use when running the query.
     *
     * For better performance, a different index might be defined
     * by setting it in the query.
     * How this improves performance and if the defined index is used,
     * depends on the RxStorage implementation.
     */
    index?: string | string[];
};

export type MangoQueryNoLimit<RxDocType> = MangoQuerySelectorAndIndex<RxDocType> & {
    /**
     * Sorting of the results.
     * If no sort is set, RxDB will sort by the primary key.
     * Also if sort is set, RxDB will add primaryKey sorting
     * if the primaryKey was not in the sort parameters before.
     * This ensures that there is a deterministic sorting of the
     * results, not mather at which order the documents have been
     * inserted into the storage.
     */
    sort?: MangoQuerySortPart<RxDocType>[];
};

export type MangoQuery<RxDocType = any> = MangoQueryNoLimit<RxDocType> & {
    skip?: number;
    limit?: number;
};

export type RxQueryOP = 'find' | 'findOne' | 'count' | 'findByIds';

export declare class RxQuery<
    RxDocumentType = any,
    RxQueryResult = any,
    OrmMethods = {},
    Reactivity = unknown
> extends RxQueryBase<RxDocumentType, RxQueryResult, OrmMethods, Reactivity> {
    equals(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    eq(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    or(queryObj: keyof RxDocumentType | string | any[]): RxQuery<RxDocumentType, RxQueryResult>;
    nor(queryObj: keyof RxDocumentType | string | any[]): RxQuery<RxDocumentType, RxQueryResult>;
    and(queryObj: keyof RxDocumentType | string | any[]): RxQuery<RxDocumentType, RxQueryResult>;
    gt(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    gte(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    lt(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    lte(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    ne(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    in(queryObj: any[]): RxQuery<RxDocumentType, RxQueryResult>;
    nin(queryObj: any[]): RxQuery<RxDocumentType, RxQueryResult>;
    all(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    regex(queryObj: string | {
        $regex: string;
        $options: MangoQueryRegexOptions;
    }): RxQuery<RxDocumentType, RxQueryResult>;
    exists(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    elemMatch(queryObj: any): RxQuery<RxDocumentType, RxQueryResult>;
    mod(p1: any, p2: any, p3: any): RxQuery<RxDocumentType, RxQueryResult>;
}
