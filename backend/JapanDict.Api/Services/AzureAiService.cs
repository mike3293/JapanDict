using Azure;
using Azure.AI.OpenAI;
using JapanDict.Api.Models;
using OpenAI.Chat;

namespace JapanDict.Api.Services;

public class AzureAiService
{
    private readonly ChatClient _chatClient;

    private const string SystemPrompt =
        """
        You are an expert Japanese language tutor specializing in kanji and vocabulary.
        When the user sends Japanese text, provide:
        1. A full breakdown of every kanji and word appearing in the text.
        2. For each kanji: character, on-yomi, kun-yomi, meaning(s), JLPT level if known.
        3. Grammar notes relevant to the sentence structure.
        4. A natural English translation of the overall text.
        5. At least one example sentence using a key vocabulary item.

        Format your response clearly with headers for each section.
        Always include the kanji character itself clearly so it can be indexed.
        """;

    public AzureAiService(IConfiguration config)
    {
        var endpoint = config["AzureOpenAI:Endpoint"]!;
        var apiKey = config["AzureOpenAI:ApiKey"]!;
        var deployment = config["AzureOpenAI:DeploymentName"] ?? "gpt-4o";

        var client = new AzureOpenAIClient(new Uri(endpoint), new AzureKeyCredential(apiKey));
        _chatClient = client.GetChatClient(deployment);
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
