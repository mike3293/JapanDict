using JapanDict.Api.Models;
using MongoDB.Driver;
using static JapanDict.Api.Services.KanjiMetadataParser;

namespace JapanDict.Api.Services;

public partial class KanjiIndexService(IMongoCollection<KanjiEntry> kanjiCollection)
{
    /// <summary>
    /// Extracts all unique kanji from <paramref name="text"/>, extracts their metadata
    /// from the AI response, and indexes them with occurrence counts in the collection.
    /// </summary>
    public async Task IndexFromTextAsync(string keyId, string aiResponse)
    {
        var characters = KanjiMetadataParser.Parse(aiResponse);

        var tasks = characters.Select(ch => UpsertAsync(keyId, ch));
        await Task.WhenAll(tasks);
    }

    public async Task<List<KanjiEntry>> GetAllAsync(string keyId) =>
        await kanjiCollection
            .Find(k => k.KeyId == keyId)
            .SortByDescending(k => k.OccurrenceCount)
            .ToListAsync();

    public async Task<List<KanjiEntry>> SearchAsync(string keyId, string query)
    {
        // character and jlpt level are exact matches, meaning is a case-insensitive contains
        var filters = new List<FilterDefinition<KanjiEntry>>
        {
            Builders<KanjiEntry>.Filter.Eq(k => k.Character, query),
            Builders<KanjiEntry>.Filter.Eq(k => k.JlptLevel, query.ToUpperInvariant()),
            Builders<KanjiEntry>.Filter.Regex(k => k.Meaning,
                new MongoDB.Bson.BsonRegularExpression(query, "i"))
        };

        var filter = Builders<KanjiEntry>.Filter.And(
            Builders<KanjiEntry>.Filter.Eq(k => k.KeyId, keyId),
            Builders<KanjiEntry>.Filter.Or(filters));

        return await kanjiCollection.Find(filter).ToListAsync();
    }


    private async Task UpsertAsync(string keyId, KanjiMetadata character)
    {
        var filter = Builders<KanjiEntry>.Filter.And(
            Builders<KanjiEntry>.Filter.Eq(k => k.KeyId, keyId),
            Builders<KanjiEntry>.Filter.Eq(k => k.Character, character.Char));

        var updateBuilder = Builders<KanjiEntry>.Update
            .SetOnInsert(k => k.KeyId, keyId)
            .SetOnInsert(k => k.Character, character.Char)
            .SetOnInsert(k => k.JlptLevel, character.Jlpt)
            .SetOnInsert(k => k.Meaning, character.Meaning)
            .SetOnInsert(k => k.FirstSeenAt, DateTime.UtcNow)
            .Set(k => k.LastSeenAt, DateTime.UtcNow)
            .Inc(k => k.OccurrenceCount, 1);

        await kanjiCollection.UpdateOneAsync(filter, updateBuilder,
            new UpdateOptions { IsUpsert = true });
    }
}