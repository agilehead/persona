# EF native query compiler

Build-only EF source is pinned to `dotnet/efcore` tag
`v11.0.0-rc.2.26504.105`, commit
`f05a97f83d8fe43366d92d561cce59f02c6dd102`.
The original .NET Foundation MIT notices are retained.

This starts from the ctlflow compiler correction, with project/namespace names changed.
It recognizes typed DbContext parameters, captured parameters, filtered joins,
nullable conversions and numeric setters. It generates compiled query
interceptors rather than interpreting application queries at runtime.
Persona also resolves unqualified compile-time constants through Roslyn's
constant-value metadata, retaining their actual CLR types (including enum
carriers). Ordinary named constants in queries must not require caller aliases
or inlined literals to compensate for a build-time translator gap.
Captured member paths retain their runtime parameter paths. The build-time
compiler creates only a typed leaf placeholder; it does not dereference a
constructor-free intermediate record or execute application constructors/getters
to obtain a value that is unavailable at build time.
The original upstream source-file boundaries are retained for review against
the pinned revision, including files longer than the application size guideline.

The compiler and its Roslyn/MSBuild dependencies are build tools. They are not
application runtime dependencies. The design-time host selects one database
context. Knex alone creates and migrates the database; EF generates no DDL or
migration history.

Native publication keeps upstream EF/GraphQL linker diagnostics visible.
Application source warnings remain errors. A successful managed build alone
does not establish NativeAOT support: execute the shared contract tests against
the published native executable. Those tests establish only their exercised
operations, not unimplemented APIs or arbitrary future EF query shapes.

The design-time host also corrects the pinned relational SQL pregenerator's
collection placeholders: upstream constructs `object` for an interface carrier,
then the SQL collection processor attempts to enumerate it. The host supplies a
typed empty value only for SQL collection parameters during generation. Scalar
JSON conversions, actual runtime values and declared parameter types remain
unchanged. This service and its parameter metadata helper are build-only.

Repository queries use the fluent EF form consistently with the reference
projects. Joins, filtering, ordering and pagination stay in SQL. Both managed
and actual native repository/GraphQL assertions cover their results and query
counts.

Typed converter access uses the accessor's declared
`ValueConverter<TModel,TProvider>` carrier. EF compiled models reconstruct type
mapping converters from their expressions, so generated readers must not cast
them to a design-time implementation subclass. This preserves the converter
expressions and stored boolean/date/JSON semantics without a runtime repair.

SQL quoting retains each property's actual type mapping from the compiled model,
including UTC timestamp and JSON converters. Looking up only CLR/store types
would discard those converters. The build-only SQLite command producer captures
final parameter mappings after SQL parameter names are uniquified. The emitter
binds each mapping by command text and database parameter name, never by a
captured variable alone: one value may populate columns with different converters.
The collector reads the pinned TypeMappedRelationalParameter mapping property
at build time; none of this metadata machinery enters application dependencies.

SQL-expression quoting also preserves the invariant source name, SQL name,
nullability and translation mode. The native fixture writes one timestamp to
two differently converted columns and checks both stored representations.
It also verifies converted JSON readers/writes, strict integer booleans and
empty/nonempty interface collections without changing queries to avoid a compiler
gap. Product queries still use the generated compiled model and interceptors.

Static query locals and aliases are resolved to their single initializer at build
time. Shared operator locations emit one interceptor. Generated operators extend
an immutable parameter-binding chain; each terminal forks fresh execution state.
Captured lambda values are read at execution, while ordinary operator arguments
(such as Skip/Take) retain their call-time values. This is the same generated
query representation for inline and reusable queries, with no dynamic query
provider or managed fallback. Reassigned/query-producing runtime graphs remain
unsupported and fail publication. Tuple writes and query references that escape by ref or out are rejected as well. The shared native compiler regression fixture verifies
repeated execution, live captures, independent branches, projection and
cancellation isolation as well as exact stored converter values.

Complete object initializers retain public construction when all required members
are assigned, including nested initializers. Compiled-model helper namespaces
and filenames belong to their DbContext, preventing collisions when models use
the same entity names. The same build-only compiler implementation is maintained
in Snapped, Lesser, Persona, TapTap and MsgCore.
