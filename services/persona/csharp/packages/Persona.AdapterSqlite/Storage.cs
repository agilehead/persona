using Persona.AdapterSqlite.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Persona.Kernel;

namespace Persona.AdapterSqlite;

public static class Storage
{
    public static PersonaDbContext Open(string databasePath, Action<DbContextOptionsBuilder<PersonaDbContext>>? configure = null)
    {
        var options = new DbContextOptionsBuilder<PersonaDbContext>()
            .UseSqlite(ConnectionString(databasePath));
        configure?.Invoke(options);
        return new PersonaDbContext(options.Options);
    }

    public static void Initialize(string databasePath)
    {
        // The SQLite provider owns WAL initialization. Open requires an existing
        // file in ReadWrite mode; this does not create tables or run migrations.
        using var database = Open(databasePath);
        database.GetService<IRelationalDatabaseCreator>().Create();
    }

    private static string ConnectionString(string databasePath)
    {
        if (!Path.IsPathFullyQualified(databasePath))
            throw new ArgumentException("The database path must be absolute.", nameof(databasePath));
        if (!File.Exists(databasePath))
            throw new FileNotFoundException("Apply the existing Knex migrations before starting Persona.", databasePath);
        var connection = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWrite,
            ForeignKeys = true,
            DefaultTimeout = 5
        };
        return connection.ToString();
    }

    public static async Task Save(PersonaDbContext database, CancellationToken cancellation)
    {
        try { await database.SaveChangesAsync(cancellation); }
        finally { database.ChangeTracker.Clear(); }
    }

    public static async Task<Result<T>> Guard<T>(Func<Task<T>> operation)
    {
        try { return Result<T>.Success(await operation()); }
        catch (Exception exception) when (exception is DbUpdateException or SqliteException)
        {
            return Result<T>.Failed(new Failure("INFRASTRUCTURE", "A storage operation failed", exception));
        }
    }

    public static async Task<Result<T>> Transaction<T>(PersonaDbContext database,
        Func<Task<Result<T>>> operation, CancellationToken cancellation)
    {
        if (database.Database.CurrentTransaction is not null) return await operation();
        try
        {
            await using var transaction = await database.Database.BeginTransactionAsync(cancellation);
            var result = await operation();
            if (result.IsSuccess) await transaction.CommitAsync(cancellation);
            else await transaction.RollbackAsync(cancellation);
            return result;
        }
        catch (Exception exception) when (exception is DbUpdateException or SqliteException)
        {
            return Result<T>.Failed(new Failure("INFRASTRUCTURE", "A storage operation failed", exception));
        }
        finally { database.ChangeTracker.Clear(); }
    }
}
