using Azure;
using Azure.AI.OpenAI;
using JapanDict.Api.Options;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace JapanDict.Api.Services;

public class AzureAiService
{
    private readonly ChatClient _chatClient;

    private const string SystemPrompt =
        """
        You are an expert Japanese language tutor specializing in kanji and vocabulary.
        When the user sends Japanese text, provide a detailed breakdown with this exact format:

        For each kanji character, use this structure:
        ?character?
        Readings: on-yomi, kun-yomi
        Meanings: meaning1, meaning2, meaning3
        JLPT: N1 (or N2, N3, N4, N5, or Unknown)
        [Add any relevant notes about usage or grammar]

        After all kanji breakdowns:
        - Provide a natural English translation of the overall text
        - Include at least one example sentence using a key vocabulary item
        - Add any grammar notes relevant to the sentence structure

        Example format:
        ???
        Readings: ?? (t?), ??? (higashi)
        Meanings: east, direction, correct
        JLPT: N4

        Always include the kanji character itself in ?? brackets, followed by meanings and JLPT level.
        """;

    public AzureAiService(IOptions<AzureOpenAIOptions> options)
    {
        var cfg = options.Value;

        var client = new AzureOpenAIClient(new Uri(cfg.Endpoint), new AzureKeyCredential(cfg.ApiKey));
        _chatClient = client.GetChatClient(cfg.DeploymentName);
    }

    /// <summary>
    /// Streams the AI response token by token.
    /// The caller accumulates the result; the full response is returned via <paramref name="fullResponse"/>.
    /// </summary>
    public async IAsyncEnumerable<string> StreamAsync(
        IEnumerable<Models.ChatMessage> history,
        Action<string> onComplete)
    {
        var messages = BuildMessages(history);
        var accumulated = new System.Text.StringBuilder();

        await foreach (var update in _chatClient.CompleteChatStreamingAsync(messages))
        {
            foreach (var part in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(part.Text))
                {
                    accumulated.Append(part.Text);
                    yield return part.Text;
                }
            }
        }

        onComplete(accumulated.ToString());
    }

    private static List<OpenAI.Chat.ChatMessage> BuildMessages(IEnumerable<Models.ChatMessage> history)
    {
        var messages = new List<OpenAI.Chat.ChatMessage>
        {
            new SystemChatMessage(SystemPrompt)
        };

        foreach (var msg in history)
        {
            if (msg.Role == "user")
                messages.Add(new UserChatMessage(msg.Content));
            else if (msg.Role == "assistant")
                messages.Add(new AssistantChatMessage(msg.Content));
        }

        return messages;
    }
}
