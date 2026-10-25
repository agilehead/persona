namespace Persona.Kernel;

public sealed record Failure(string Code, string Message, Exception? Cause = null);

public readonly record struct Result<T>(bool IsSuccess, T Value, Failure? Error)
{
    public static Result<T> Success(T value) => new(true, value, null);

    public static Result<T> Failed(string code, string message) =>
        new(false, default!, new Failure(code, message));

    public static Result<T> Failed(Failure error) => new(false, default!, error);
}
