using JapanDict.Api.Models;
using JapanDict.Api.Options;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using JapanDict.Api.Services;

namespace JapanDict.Api.Extensions;

public static class DatabaseExtensions
{
    extension(IServiceProvider services)
    {
        public async Task SeedDatabaseAsync()
        {
            await EnsureIndexesAsync();

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

            async Task EnsureIndexesAsync()
            {
                var kanjiCollection = services.GetRequiredService<IMongoCollection<KanjiEntry>>();
                var indexes = new List<CreateIndexModel<KanjiEntry>>
                {
                    // Supports: Find(k => k.KeyId == keyId).SortByDescending(k => k.OccurrenceCount)
                    new(
                        Builders<KanjiEntry>.IndexKeys
                            .Ascending(k => k.KeyId)
                            .Descending(k => k.OccurrenceCount)),

                    // Unique index to support the upsert filter (KeyId + Character)
                    new(
                        Builders<KanjiEntry>.IndexKeys
                            .Ascending(k => k.KeyId)
                            .Ascending(k => k.Character),
                        new CreateIndexOptions { Unique = true }),

                    // Indexes to speed up search queries
                    new(Builders<KanjiEntry>.IndexKeys.Ascending(k => k.Character)),
                };

                await kanjiCollection.Indexes.CreateManyAsync(indexes);

                var chatCollection = services.GetRequiredService<IMongoCollection<ChatSession>>();
                var chatIndexes = new List<CreateIndexModel<ChatSession>>
                {
                    new(
                        Builders<ChatSession>.IndexKeys
                            .Ascending(s => s.KeyId)
                            .Descending(s => s.UpdatedAt)),

                    new(
                        Builders<ChatSession>.IndexKeys
                            .Ascending(s => s.KeyId)
                            .Ascending(s => s.Id))
                };

                await chatCollection.Indexes.CreateManyAsync(chatIndexes);
            }
        }
    }
}
