using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace JapanDict.Api.Models;

public class AccessKey
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
