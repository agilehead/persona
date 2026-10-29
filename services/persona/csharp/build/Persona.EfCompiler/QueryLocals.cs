using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Persona.Build.Ef;

// Resolve only query graphs whose shape is fixed by a single local initializer.
// Values captured by their lambdas remain runtime values, not build-time constants.
internal static class QueryLocals
{
    public static bool TryInitializer(ExpressionSyntax expression, SemanticModel model, out ExpressionSyntax initializer)
    {
        initializer = null!;
        if (expression is ParenthesizedExpressionSyntax parentheses)
            return TryInitializer(parentheses.Expression, model, out initializer);
        if (expression is not IdentifierNameSyntax || model.GetSymbolInfo(expression).Symbol is not ILocalSymbol local
            || local.Type is not INamedTypeSymbol type
            || !type.AllInterfaces.Prepend(type).Any(candidate => candidate.OriginalDefinition.ToDisplayString() == "System.Linq.IQueryable<T>"))
            return false;
        if (local.DeclaringSyntaxReferences.SingleOrDefault()?.GetSyntax() is not VariableDeclaratorSyntax { Initializer.Value: { } value } declaration)
            return false;
        var owner = declaration.Ancestors().FirstOrDefault(node => node is BaseMethodDeclarationSyntax
            or LocalFunctionStatementSyntax or AnonymousFunctionExpressionSyntax) ?? declaration.SyntaxTree.GetRoot();
        foreach (var node in owner.DescendantNodes())
        {
            var target = node switch
            {
                AssignmentExpressionSyntax assignment => assignment.Left,
                ArgumentSyntax argument when argument.RefKindKeyword.IsKind(SyntaxKind.RefKeyword)
                    || argument.RefKindKeyword.IsKind(SyntaxKind.OutKeyword) => argument.Expression,
                RefExpressionSyntax reference => reference.Expression,
                _ => null
            };
            if (target is not null && target.DescendantNodesAndSelf().OfType<IdentifierNameSyntax>()
                .Any(identifier => SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(identifier).Symbol, local)))
                return false;
        }
        initializer = value;
        return true;
    }
}
