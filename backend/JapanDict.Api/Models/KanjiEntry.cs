using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace JapanDict.Api.Models;

public class KanjiEntry
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string KeyId { get; set; } = string.Empty;

    /// <summary>Single CJK character, e.g. "東".</summary>
    public string Character { get; set; } = string.Empty;

    public int OccurrenceCount { get; set; } = 1;

    public DateTime FirstSeenAt { get; set; } = DateTime.UtcNow;

    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
}
