using JapanDict.Api.Models;
using MongoDB.Driver;

namespace JapanDict.Api.Services;

public class ChatSessionService(IMongoCollection<ChatSession> sessions)
{
    public async Task<List<ChatSessionSummary>> GetSessionsAsync(string keyId) =>
        await sessions
            .Aggregate()
            .Match(s => s.KeyId == keyId)
            .SortByDescending(s => s.UpdatedAt)
            .Project(s => new ChatSessionSummary(
                s.Id,
                s.Title,
                s.CreatedAt,
                s.UpdatedAt,
                s.Messages.Count))
            .ToListAsync();

    public async Task<ChatSession?> GetSessionAsync(string keyId, string sessionId) =>
        await sessions.Find(s => s.KeyId == keyId && s.Id == sessionId).FirstOrDefaultAsync();

    public async Task<ChatSession> CreateSessionAsync(string keyId)
    {
        var session = new ChatSession
        {
            KeyId = keyId,
            Title = $"Session {DateTime.UtcNow:yyyy-MM-dd HH:mm}"
        };
        await sessions.InsertOneAsync(session);
        return session;
    }

    public async Task AppendMessageAsync(string sessionId, ChatMessage message)
    {
        var update = Builders<ChatSession>.Update
            .Push(s => s.Messages, message)
            .Set(s => s.UpdatedAt, DateTime.UtcNow);

        await sessions.UpdateOneAsync(s => s.Id == sessionId, update);
    }

    /// <summary>Sets a human-readable title derived from the first user message.</summary>
    public async Task SetTitleAsync(string sessionId, string title)
    {
        var trimmed = title.Length > 60 ? string.Concat(title.AsSpan(0, 57), "...") : title;
        await sessions.UpdateOneAsync(
            s => s.Id == sessionId,
            Builders<ChatSession>.Update.Set(s => s.Title, trimmed));
    }
}

public record ChatSessionSummary(string Id, string Title, DateTime CreatedAt, DateTime UpdatedAt, int MessageCount);
