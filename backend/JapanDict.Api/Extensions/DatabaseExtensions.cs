using JapanDict.Api.Models;
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
                    new(Builders<KanjiEntry>.IndexKeys.Ascending(k => k.JlptLevel))
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
