import type { NotFound, Redirect } from './outcome.ts';
import type { ParamConstraints } from './pattern-set.ts';
import type { PathParamNames, PathParams } from './path-params.ts';
import type { ResolutionInput } from './resolve.ts';

// What guard and load get; Route keeps it loose, route() fills in the types
export interface StepInput<
	Params = Readonly<Record<string, unknown>>,
	Context = unknown,
> extends Pick<ResolutionInput, 'url' | 'signal'> {
	readonly params: Params;
	readonly context: Context;
}

// What render gets; routes with children also get their child's result
export interface RenderInput<
	Params = Readonly<Record<string, unknown>>,
	Context = unknown,
	Data = unknown,
> extends Omit<StepInput<Params, Context>, 'signal'> {
	readonly data: Data;
}

declare const routeTypes: unique symbol;

// What the type system knows about a route made by route(); nothing is stored under it
export interface RouteTypes {
	readonly requirements: RouteRequirements;
	// Own path params, typed by the route's constraints
	readonly params: object;
	// What the route's guard adds to the context
	readonly extension: object;
	// What the route resolves to together with its children
	readonly result: unknown;
}

export interface Route {
	readonly path: string;
	readonly params?: ParamConstraints;
	readonly children?: readonly Route[];
	// Methods, so routes with precisely typed steps still fit here
	guard?(input: StepInput): unknown;
	load?(input: StepInput): unknown;
	render?(input: RenderInput & { readonly child?: unknown }): unknown;
	readonly [routeTypes]?: RouteTypes;
}

// What a route expects from every place in the tree it is mounted at
export interface RouteRequirements {
	readonly context?: object;
	readonly params?: object;
}

// Flattens an intersection so editors show a plain object type
type Prettify<T> = { [Key in keyof T]: T[Key] } & {};

type Outcomes = Redirect | NotFound;

type RequiredContext<Requirements> = Requirements extends {
	readonly context: infer Context extends object;
}
	? Context
	: {};

type RequiredParams<Requirements> = Requirements extends {
	readonly params: infer Params extends object;
}
	? Params
	: {};

// What a guard's return adds: outcomes end the resolution, nothing adds nothing
type ExtensionOf<GuardReturn> = [Exclude<Awaited<GuardReturn>, Outcomes | void>] extends [never]
	? {}
	: Exclude<Awaited<GuardReturn>, Outcomes | void>;

// A guard's keys replace the same keys of the context, types included
type Extend<Context, Extension> = Prettify<Omit<Context, keyof Extension> & Extension>;

type DataOf<LoadReturn> = Exclude<Awaited<LoadReturn>, Outcomes>;

declare const noRender: unique symbol;

// Stands for "no render" until inference finds one
type NoRender = typeof noRender;

// Result of one route; routes built at runtime are unknown to the type system
type ResultOfRoute<Node> = Node extends { readonly [routeTypes]?: infer Types }
	? Types extends RouteTypes
		? Types['result']
		: unknown
	: unknown;

// Union of the results of a list of routes
export type ResultOfRoutes<Routes extends readonly Route[]> = number extends Routes['length']
	? unknown
	: ResultOfRoute<Routes[number]>;

type ResultOf<RenderReturn, Data, Children extends readonly Route[]> = [RenderReturn] extends [
	NoRender,
]
	? Children extends readonly []
		? Data
		: ResultOfRoutes<Children>
	: Exclude<RenderReturn, Outcomes>;

// What route() inferred; never for routes built at runtime, which are not checked
type TypesOf<Node> = Node extends { readonly [routeTypes]?: infer Types }
	? Types extends RouteTypes
		? Types
		: never
	: never;

// Keys the guards above provide must have the types the route expects;
// the rest of the expected context comes from resolve
type ProvidedContextFits<Provided, Expected> = [
	Pick<Provided, keyof Provided & keyof Expected>,
] extends [Pick<Expected, keyof Provided & keyof Expected>]
	? true
	: false;

// Whether a route and its subtree get what they expect, given the ancestors' params
// and the context their guards provide
type MeetsRequirements<Node, Params, Provided> = Node extends unknown
	? [TypesOf<Node>] extends [never]
		? true
		: Params extends RequiredParams<TypesOf<Node>['requirements']>
			? ProvidedContextFits<
					Provided,
					RequiredContext<TypesOf<Node>['requirements']>
				> extends true
				? ChildrenMeetRequirements<
						Node,
						Params & TypesOf<Node>['params'],
						Extend<Provided, TypesOf<Node>['extension']>
					>
				: false
			: false
	: never;

type ChildrenMeetRequirements<Node, Params, Provided> = Node extends {
	readonly children: infer Children extends readonly Route[];
}
	? number extends Children['length']
		? true
		: false extends MeetsRequirements<Children[number], Params, Provided>
			? false
			: true
	: true;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
	value: infer Intersection,
) => void
	? Intersection
	: never;

// Context keys a route and its subtree expect that no guard above provides
type UncoveredContext<Node, Provided> = Node extends unknown
	? [TypesOf<Node>] extends [never]
		? {}
		: Omit<RequiredContext<TypesOf<Node>['requirements']>, keyof Provided> &
				ChildrenUncoveredContext<Node, Extend<Provided, TypesOf<Node>['extension']>>
	: never;

type ChildrenUncoveredContext<Node, Provided> = Node extends {
	readonly children: infer Children extends readonly Route[];
}
	? number extends Children['length']
		? {}
		: UnionToIntersection<UncoveredContext<Children[number], Provided>>
	: {};

// The context resolve has to be given for a tree of routes
export type RootContext<Routes extends readonly Route[]> = number extends Routes['length']
	? {}
	: Prettify<UnionToIntersection<UncoveredContext<Routes[number], {}>>>;

interface UnmetRouteRequirements {
	readonly 'Error: a route in this subtree expects params or context its place in the tree does not give': never;
}

// Root routes as createRouter accepts them: one whose subtree misses a requirement is an error
export type CheckedRoutes<Routes extends readonly Route[]> = {
	readonly [Index in keyof Routes]: MeetsRequirements<Routes[Index], {}, {}> extends true
		? Routes[Index]
		: UnmetRouteRequirements;
};

// Turns a constraint on a name the route's own path lacks into a type error
type OwnParamsOnly<Path extends string, Constraints> = {
	readonly [Name in keyof Constraints]: Name extends PathParamNames<Path>
		? Constraints[Name]
		: never;
};

type StepParams<Requirements, Path extends string, Constraints> = Prettify<
	PathParams<Path, Constraints> & RequiredParams<Requirements>
>;

type RenderArgument<
	Params,
	Context,
	Data,
	Children extends readonly Route[],
> = Children extends readonly []
	? RenderInput<Params, Context, Data>
	: RenderInput<Params, Context, Data> & { readonly child: ResultOfRoutes<Children> };

export interface RouteDefinition<
	Requirements,
	Path extends string,
	Constraints,
	Children extends readonly Route[],
	GuardReturn,
	LoadReturn,
	RenderReturn,
> {
	readonly path: Path;
	readonly params?: Constraints & OwnParamsOnly<Path, Constraints>;
	readonly children?: Children;
	readonly guard?: (
		input: StepInput<
			StepParams<Requirements, Path, Constraints>,
			RequiredContext<Requirements>
		>,
	) => GuardReturn;
	readonly load?: (
		input: StepInput<
			StepParams<Requirements, Path, Constraints>,
			Extend<RequiredContext<Requirements>, ExtensionOf<GuardReturn>>
		>,
	) => LoadReturn;
	readonly render?: (
		input: RenderArgument<
			StepParams<Requirements, Path, Constraints>,
			Extend<RequiredContext<Requirements>, ExtensionOf<GuardReturn>>,
			DataOf<LoadReturn>,
			Children
		>,
	) => RenderReturn;
}

// The route as the tree sees it: its path, constraints, children and inferred types
export type RouteOf<
	Requirements,
	Path extends string,
	Constraints,
	Children extends readonly Route[],
	GuardReturn,
	LoadReturn,
	RenderReturn,
> = { readonly path: Path } & ({} extends Constraints ? {} : { readonly params: Constraints }) &
	(Children extends readonly [] ? {} : { readonly children: Children }) & {
		readonly [routeTypes]?: {
			readonly requirements: Requirements;
			readonly params: PathParams<Path, Constraints>;
			readonly extension: ExtensionOf<GuardReturn>;
			readonly result: ResultOf<RenderReturn, DataOf<LoadReturn>, Children>;
		};
	};

export interface RouteFunction<Requirements extends RouteRequirements> {
	<
		const Path extends string,
		const Constraints extends ParamConstraints = {},
		const Children extends readonly Route[] = readonly [],
		GuardReturn = void,
		LoadReturn = undefined,
		RenderReturn = NoRender,
	>(
		definition: RouteDefinition<
			Requirements,
			Path,
			Constraints,
			Children,
			GuardReturn,
			LoadReturn,
			RenderReturn
		>,
		// NoInfer: a call nested in children must not take its types from the parent's Route[]
	): NoInfer<
		RouteOf<Requirements, Path, Constraints, Children, GuardReturn, LoadReturn, RenderReturn>
	>;
}

function identity(definition: Route): Route {
	return definition;
}

// Identity at runtime; exists so the literal path, children and step types are kept
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const route: RouteFunction<{}> = identity as RouteFunction<{}>;

// A route() for routes that expect context keys or ancestor params from the tree
export function routeWith<Requirements extends RouteRequirements>(): RouteFunction<Requirements> {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return identity as RouteFunction<Requirements>;
}
