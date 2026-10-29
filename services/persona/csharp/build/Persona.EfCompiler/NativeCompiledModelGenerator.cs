using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Design.Internal;
using Microsoft.EntityFrameworkCore.Scaffolding.Internal;

namespace Persona.Build.Ef;

// EF's model helper names are unique within one model, not across contexts.
// Keep each context's helpers isolated even when entity CLR names are shared.
[SuppressMessage("Usage", "EF1001", Justification = "Version-pinned build-time compiled-model generator; never used at runtime.")]
public sealed class NativeCompiledModelGenerator(
    ICSharpRuntimeAnnotationCodeGenerator annotations,
    ICSharpHelper code) : CSharpRuntimeModelCodeGenerator(annotations, code)
{
    public override IReadOnlyCollection<ScaffoldedFile> GenerateModel(
        IModel model, CompiledModelCodeGenerationOptions options)
    {
        options.ModelNamespace = $"{options.ContextType.Namespace}.CompiledModels.{options.ContextType.Name}Artifacts";
        return base.GenerateModel(model, options)
            .Select(file => new ScaffoldedFile(options.ContextType.Name + "." + file.Path, file.Code))
            .ToArray();
    }
}
