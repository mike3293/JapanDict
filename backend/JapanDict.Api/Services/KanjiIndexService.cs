using System.Text.RegularExpressions;
using JapanDict.Api.Models;
using MongoDB.Driver;

namespace JapanDict.Api.Services;

public partial class KanjiIndexService(IMongoCollection<KanjiEntry> kanjiCollection)
{
    // Matches single CJK Unified Ideographs (U+4E00–U+9FFF) — the core kanji block.
    // CJK Extension A/B and rare blocks are intentionally excluded to keep noise low.
    [GeneratedRegex(@"[\u4e00-\u9fff]")]
    private static partial Regex KanjiRegex();

    /// <summary>
    /// Extracts all unique kanji from <paramref name="text"/>, increments their occurrence
    /// counters (or inserts them for the first time) in the kanji_index collection.
    /// </summary>
    public async Task IndexFromTextAsync(string keyId, string text)
    {
        var characters = KanjiRegex()
            .Matches(text)
            .Select(m => m.Value)
            .Distinct();

        var tasks = characters.Select(ch => UpsertAsync(keyId, ch));
        await Task.WhenAll(tasks);
    }

    private async Task UpsertAsync(string keyId, string character)
    {
        var filter = Builders<KanjiEntry>.Filter.And(
            Builders<KanjiEntry>.Filter.Eq(k => k.KeyId, keyId),
            Builders<KanjiEntry>.Filter.Eq(k => k.Character, character));

        var update = Builders<KanjiEntry>.Update
            .SetOnInsert(k => k.KeyId, keyId)
            .SetOnInsert(k => k.Character, character)
            .SetOnInsert(k => k.FirstSeenAt, DateTime.UtcNow)
            .Set(k => k.LastSeenAt, DateTime.UtcNow)
            .Inc(k => k.OccurrenceCount, 1);

        await kanjiCollection.UpdateOneAsync(filter, update,
            new UpdateOptions { IsUpsert = true });
    }

    public async Task<List<KanjiEntry>> GetAllAsync(string keyId) =>
        await kanjiCollection
            .Find(k => k.KeyId == keyId)
            .SortByDescending(k => k.OccurrenceCount)
            .ToListAsync();

    public async Task<List<KanjiEntry>> SearchAsync(string keyId, string query)
    {
        var filter = Builders<KanjiEntry>.Filter.And(
            Builders<KanjiEntry>.Filter.Eq(k => k.KeyId, keyId),
            Builders<KanjiEntry>.Filter.Or(
                Builders<KanjiEntry>.Filter.Eq(k => k.Character, query)));

        return await kanjiCollection.Find(filter).ToListAsync();
    }
}
