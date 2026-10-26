namespace Persona.Kernel;

public interface IUnitOfWork
{
    Task<Result<T>> Run<T>(Func<CancellationToken, Task<Result<T>>> operation, CancellationToken cancellation);
}
