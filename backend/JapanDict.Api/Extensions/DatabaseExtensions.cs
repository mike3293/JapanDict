using JapanDict.Api.Models;
using JapanDict.Api.Options;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace JapanDict.Api.Extensions;

public static class DatabaseExtensions
{
    extension(IServiceProvider services)
    {
        public async Task SeedDatabaseAsync()
        {
            var accessKeysCollection = services.GetRequiredService<IMongoCollection<AccessKey>>();
            var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseSeeding");

            if (!await accessKeysCollection.Find(_ => true).AnyAsync())
            {
                var seedingOptions = services.GetRequiredService<IOptions<SeedingOptions>>().Value;

                var testKey = new AccessKey
                {
                    Id = seedingOptions.InitialAccessKey,
                    Label = "Admin access key",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                await accessKeysCollection.InsertOneAsync(testKey);
                logger.LogInformation("Seeded test access key: {KeyId}", testKey.Id);
            }
        }
    }
}
