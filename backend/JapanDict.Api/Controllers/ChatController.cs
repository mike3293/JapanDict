using System.Text.Json;
using JapanDict.Api.Models;
using JapanDict.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace JapanDict.Api.Controllers;

[ApiController]
[Route("api/chat")]
public class ChatController(
    ChatSessionService chatService,
    AzureAiService aiService,
    KanjiIndexService kanjiService) : ControllerBase
{
    private string KeyId => HttpContext.Items["ApiKeyId"]?.ToString()
        ?? throw new InvalidOperationException("ApiKeyId not set by middleware.");

    // ── GET /api/chat/sessions ─────────────────────────────────────────────
    [HttpGet("sessions")]
    public async Task<IActionResult> GetSessions() =>
        Ok(await chatService.GetSessionsAsync(KeyId));

    // ── POST /api/chat/sessions ────────────────────────────────────────────
    [HttpPost("sessions")]
    public async Task<IActionResult> CreateSession()
    {
        var session = await chatService.CreateSessionAsync(KeyId);
        return CreatedAtAction(nameof(GetSession), new { id = session.Id }, session);
    }

    // ── GET /api/chat/sessions/{id} ────────────────────────────────────────
    [HttpGet("sessions/{id}")]
    public async Task<IActionResult> GetSession(string id)
    {
        var session = await chatService.GetSessionAsync(KeyId, id);
        return session is null ? NotFound() : Ok(session);
    }

    // ── POST /api/chat/sessions/{id}/messages ──────────────────────────────
    /// <summary>
    /// Appends a user message, streams the AI response as Server-Sent Events,
    /// then saves the full assistant reply and indexes kanji.
    ///
    /// SSE format:
    ///   data: {"token":"..."}\n\n   — for each streamed token
    ///   data: [DONE]\n\n            — signals stream end
    /// </summary>
    [HttpPost("sessions/{id}/messages")]
    public async Task SendMessage(string id, [FromBody] SendMessageRequest request,
        CancellationToken cancellationToken)
    {
        var session = await chatService.GetSessionAsync(KeyId, id);
        if (session is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { error = "Session not found." }, cancellationToken);
            return;
        }

        // Append user message
        var userMessage = new ChatMessage { Role = "user", Content = request.Content };
        await chatService.AppendMessageAsync(id, userMessage);

        // Auto-title on first message
        if (session.Messages.Count == 0)
            await chatService.SetTitleAsync(id, request.Content);

        // Set up SSE headers
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        string fullResponse = string.Empty;

        await foreach (var token in aiService.StreamAsync(
            [.. session.Messages, userMessage],
            complete => fullResponse = complete).WithCancellation(cancellationToken))
        {
            var payload = JsonSerializer.Serialize(new { token });
            await Response.WriteAsync($"data: {payload}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        // Signal end of stream
        await Response.WriteAsync("data: [DONE]\n\n", cancellationToken);
        await Response.Body.FlushAsync(cancellationToken);

        // Persist assistant reply and index kanji (fire-and-forget after response)
        var assistantMessage = new ChatMessage { Role = "assistant", Content = fullResponse };
        await chatService.AppendMessageAsync(id, assistantMessage);
        await kanjiService.IndexFromTextAsync(KeyId, request.Content, fullResponse);
    }
}

public record SendMessageRequest(string Content);
