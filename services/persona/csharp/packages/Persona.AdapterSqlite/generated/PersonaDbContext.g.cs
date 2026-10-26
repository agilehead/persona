#nullable enable

using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore;
using Persona.AdapterSqlite.Entities;

namespace Persona.AdapterSqlite;

public sealed partial class PersonaDbContext : DbContext
{
    [UnconditionalSuppressMessage("Trimming", "IL2026", Justification = "Native publishing generates the EF compiled model and query interceptors; the native contract suite exercises them.")]
    [UnconditionalSuppressMessage("AOT", "IL3050", Justification = "Native publishing generates the EF compiled model and query interceptors; the native contract suite exercises them.")]
    public PersonaDbContext(DbContextOptions<PersonaDbContext> options) : base(options) { }

    public DbSet<IdentityRow> Identity => Set<IdentityRow>();
    public DbSet<SessionRow> Session => Set<SessionRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<IdentityRow>(entity =>
        {
            entity.ToTable("identity");
            entity.HasKey(row => new { row.Id });
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.TenantId).HasColumnName("tenant_id");
            entity.Property(row => row.Provider).HasColumnName("provider");
            entity.Property(row => row.ProviderUserId).HasColumnName("provider_user_id");
            entity.Property(row => row.Email).HasColumnName("email");
            entity.Property(row => row.Name).HasColumnName("name");
            entity.Property(row => row.ProfileImageUrl).HasColumnName("profile_image_url");
            entity.Property(row => row.UserId).HasColumnName("user_id");
            entity.Property(row => row.Roles).HasColumnName("roles");
            entity.Property(row => row.Metadata).HasColumnName("metadata");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
        });
        modelBuilder.Entity<SessionRow>(entity =>
        {
            entity.ToTable("session");
            entity.HasKey(row => new { row.Id });
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.IdentityId).HasColumnName("identity_id");
            entity.Property(row => row.TenantId).HasColumnName("tenant_id");
            entity.Property(row => row.TokenHash).HasColumnName("token_hash");
            entity.Property(row => row.ExpiresAt).HasColumnName("expires_at");
            entity.Property(row => row.Revoked).HasColumnName("revoked");
            entity.Property(row => row.IpAddress).HasColumnName("ip_address");
            entity.Property(row => row.UserAgent).HasColumnName("user_agent");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne<IdentityRow>().WithMany().HasForeignKey(row => row.IdentityId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
