namespace Persona.Build.Ef;

internal static class QueryTemplateCode
{
    // Each operator extends a persistent binding chain. Every enumeration gets a
    // fresh EF QueryContext; lambdas read their captured values at execution time.
    public const string Text = """
        private sealed record QueryBinding(string Name, global::System.Func<object?> Read, QueryBinding? Previous);
        private class QueryTemplate<T> : global::System.Linq.IOrderedQueryable<T>
        {
            private QueryBinding? bindings;
            private global::Microsoft.EntityFrameworkCore.Query.QueryContext? context;
            public global::Microsoft.EntityFrameworkCore.DbContext DbContext { get; }
            public QueryTemplate(global::Microsoft.EntityFrameworkCore.DbContext database) => DbContext = database;
            protected QueryTemplate(global::Microsoft.EntityFrameworkCore.DbContext database, QueryBinding? values)
            { DbContext = database; bindings = values; }
            public QueryTemplate<T> Fork() => new(DbContext, bindings);
            public QueryTemplate<TResult> ToType<TResult>() => new(DbContext, bindings);
            public global::Microsoft.EntityFrameworkCore.Query.IIncludableQueryable<T, TProperty> ToIncludable<TProperty>() =>
                new Included<TProperty>(DbContext, bindings);
            public void Bind(string name, global::System.Func<object?> read)
            {
                bindings = new QueryBinding(name, read, bindings);
                if (context is not null) context.Parameters.Add(name, read());
            }
            public void BindValue(string name, object? value) => Bind(name, () => value);
            public global::Microsoft.EntityFrameworkCore.Query.QueryContext QueryContext
            {
                get
                {
                    if (context is not null) return context;
                    context = global::Microsoft.EntityFrameworkCore.Infrastructure.AccessorExtensions
                        .GetService<global::Microsoft.EntityFrameworkCore.Query.IQueryContextFactory>(DbContext).Create();
                    var ordered = new global::System.Collections.Generic.Stack<QueryBinding>();
                    for (var binding = bindings; binding is not null; binding = binding.Previous) ordered.Push(binding);
                    while (ordered.TryPop(out var binding)) context.Parameters.Add(binding.Name, binding.Read());
                    return context;
                }
            }
            public global::System.Type ElementType => typeof(T);
            public global::System.Linq.Expressions.Expression Expression => throw new global::System.NotSupportedException("A precompiled query must execute its generated interceptor");
            public global::System.Linq.IQueryProvider Provider => throw new global::System.NotSupportedException("A precompiled query must execute its generated interceptor");
            public global::System.Collections.Generic.IEnumerator<T> GetEnumerator() => throw new global::System.NotSupportedException("A precompiled query must execute its generated interceptor");
            global::System.Collections.IEnumerator global::System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
            private sealed class Included<TProperty>(global::Microsoft.EntityFrameworkCore.DbContext database, QueryBinding? values)
                : QueryTemplate<T>(database, values), global::Microsoft.EntityFrameworkCore.Query.IIncludableQueryable<T, TProperty>;
        }
        """;
}
