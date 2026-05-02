/**
 * Type-safe nominal keys for dependency injection.
 *
 * `ServiceKey<T>` and `EventKey<T>` are phantom-typed string-id wrappers
 * that allow services and events to be registered/looked up with full
 * type safety. They have no runtime behavior beyond holding the id.
 *
 * Lives in `model/` so any layer (including `i18n/`) can construct typed
 * keys without depending on `plugins/`.
 */

/** Type-safe event key for compile-time payload checking. */
export class EventKey<T> {
	declare readonly _type: T;
	constructor(public readonly id: string) {}
}

/** Type-safe service key for compile-time type checking. */
export class ServiceKey<T> {
	declare readonly _type: T;
	constructor(public readonly id: string) {}
}
