import type { StandardSchemaV1 } from './standard-schema.ts';

type Segments<Pattern extends string> = Pattern extends `${infer Head}/${infer Rest}`
	? [Head, ...Segments<Rest>]
	: [Pattern];

type RequiredName<Segment> = Segment extends '*'
	? '*'
	: Segment extends `:${string}?`
		? never
		: Segment extends `:${infer Name}`
			? Name
			: never;

type OptionalName<Segment> = Segment extends `:${infer Name}?` ? Name : never;

type AnyName<Segment> = Segment extends `:${infer Name}` ? Name : never;

// Splits off one "{...}?" group at a time; groups never nest
type RequiredNames<Pattern extends string> =
	Pattern extends `${infer Before}{${string}}?${infer After}`
		? RequiredName<Segments<Before>[number]> | RequiredNames<After>
		: RequiredName<Segments<Pattern>[number]>;

type OptionalNames<Pattern extends string> =
	Pattern extends `${infer Before}{${infer Inside}}?${infer After}`
		? | OptionalName<Segments<Before>[number]>
			| AnyName<Segments<Inside>[number]>
			| OptionalNames<After>
		: OptionalName<Segments<Pattern>[number]>;

// Flattens an intersection so editors show a plain object type
type Prettify<T> = { [Key in keyof T]: T[Key] } & {};

// Every param name the pattern declares, "*" for a wildcard
export type PathParamNames<Pattern extends string> =
	RequiredNames<Pattern> | OptionalNames<Pattern>;

// Constrained params take the constraint's output type, the rest stay strings
type ParamValue<Name extends string, Constraints> = Name extends keyof Constraints
	? Constraints[Name] extends StandardSchemaV1
		? StandardSchemaV1.InferOutput<Constraints[Name]>
		: string
	: string;

// Path params a URL matched by the pattern carries, keyed by name
export type PathParams<Pattern extends string, Constraints = {}> = string extends Pattern
	? // Without a literal pattern nothing is known about the names
		Record<string, string | undefined>
	: Prettify<
			{ [Name in RequiredNames<Pattern>]: ParamValue<Name, Constraints> } & {
				[Name in OptionalNames<Pattern>]?: ParamValue<Name, Constraints>;
			}
		>;
