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
    /// Extracts all unique kanji from <paramref name="text"/>, extracts their metadata
    /// from the AI response, and indexes them with occurrence counts in the collection.
    /// </summary>
    public async Task IndexFromTextAsync(string keyId, string text, string? aiResponse = null)
    {
        var metadata = aiResponse != null ? ExtractKanjiMetadata(aiResponse) : null;

        var characters = KanjiRegex()
            .Matches(text)
            .Select(m => m.Value)
            .Distinct();

        var tasks = characters.Select(ch =>
        {
            var meta = metadata != null && metadata.ContainsKey(ch)
                ? metadata[ch]
                : (new List<string>(), new List<string>(), (string?)null);
            return UpsertAsync(keyId, ch, meta);
        });
        await Task.WhenAll(tasks);
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
                Builders<KanjiEntry>.Filter.Eq(k => k.Character, query),
                Builders<KanjiEntry>.Filter.AnyEq(k => k.Readings, query),
                Builders<KanjiEntry>.Filter.AnyEq(k => k.Meanings, query),
                Builders<KanjiEntry>.Filter.Eq(k => k.JlptLevel, query.ToUpperInvariant())));

        return await kanjiCollection.Find(filter).ToListAsync();
    }


    private async Task UpsertAsync(string keyId, string character, (List<string> readings, List<string> meanings, string? jlptLevel) metadata = default)
    {
        var filter = Builders<KanjiEntry>.Filter.And(
            Builders<KanjiEntry>.Filter.Eq(k => k.KeyId, keyId),
            Builders<KanjiEntry>.Filter.Eq(k => k.Character, character));

        var updateBuilder = Builders<KanjiEntry>.Update
            .SetOnInsert(k => k.KeyId, keyId)
            .SetOnInsert(k => k.Character, character)
            .SetOnInsert(k => k.FirstSeenAt, DateTime.UtcNow)
            .Set(k => k.LastSeenAt, DateTime.UtcNow)
            .Inc(k => k.OccurrenceCount, 1);

        // Populate readings, meanings and JLPT level if provided and not already set
        if (metadata.readings?.Count > 0)
            updateBuilder = updateBuilder.SetOnInsert(k => k.Readings, metadata.readings);

        if (metadata.meanings?.Count > 0)
            updateBuilder = updateBuilder.SetOnInsert(k => k.Meanings, metadata.meanings);

        if (!string.IsNullOrEmpty(metadata.jlptLevel))
            updateBuilder = updateBuilder.SetOnInsert(k => k.JlptLevel, metadata.jlptLevel);

        await kanjiCollection.UpdateOneAsync(filter, updateBuilder,
            new UpdateOptions { IsUpsert = true });
    }

    /// <summary>
    /// Extracts kanji metadata (character, readings, meanings, JLPT level) from text.
    /// Parses structured kanji entries from formatted text responses.
    /// </summary>
    private Dictionary<string, (List<string> readings, List<string> meanings, string? jlptLevel)> ExtractKanjiMetadata(string text)
    {
        var result = new Dictionary<string, (List<string>, List<string>, string?)>();

        // Pattern to match kanji entries: "character: meanings | JLPT: level" or similar
        var charPattern = new Regex(@"【(.?)】|^(.?)\s*[-–:]\s*", RegexOptions.Multiline);
        var readingsPattern = new Regex(@"[Rr]eadings?\s*[:：]\s*([^|【\n]+)", RegexOptions.IgnoreCase);
        var jlptPattern = new Regex(@"JLPT\s*[:：]\s*([N\d]+|Unknown)", RegexOptions.IgnoreCase);
        var meaningPattern = new Regex(@"[Mm]eaning[s]?\s*[:：]\s*([^|【\n]+)", RegexOptions.IgnoreCase);

        var lines = text.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

        foreach (var line in lines)
        {
            var charMatch = charPattern.Match(line);
            if (!charMatch.Success) continue;

            var character = charMatch.Groups[1].Value ?? charMatch.Groups[2].Value;
            if (string.IsNullOrEmpty(character) || character.Length != 1) continue;

            var readings = new List<string>();
            var readingsMatch = readingsPattern.Match(line);
            if (readingsMatch.Success)
            {
                var readingsText = readingsMatch.Groups[1].Value;
                readings = readingsText
                    .Split(new[] { ',', '、', ';' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(r => r.Trim())
                    .Where(r => !string.IsNullOrEmpty(r))
                    .ToList();
            }

            var jlptMatch = jlptPattern.Match(line);
            var jlptLevel = jlptMatch.Success ? jlptMatch.Groups[1].Value : null;

            var meanings = new List<string>();
            var meaningMatch = meaningPattern.Match(line);
            if (meaningMatch.Success)
            {
                var meaningsText = meaningMatch.Groups[1].Value;
                meanings = meaningsText
                    .Split(new[] { ',', '、', ';' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(m => m.Trim())
                    .Where(m => !string.IsNullOrEmpty(m))
                    .ToList();
            }

            if (!result.ContainsKey(character))
                result[character] = (readings, meanings, jlptLevel);
        }

        return result;
    }
}
