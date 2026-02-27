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
    Ты — эксперт по кандзи и этимологии.
    
    Если пользователь пишет ОДИН кандзи:
    1) Кратко укажи основной смысл.
    2) Разбери по РЕАЛЬНЫМ радикалам (не выдумывай).
    3) Объясни:
       - что означает каждый радикал,
       - почему он так выглядит,
       - как из их сложения получился общий смысл,
       - историческое происхождение написания.
    4) В конце ОБЯЗАТЕЛЬНО добавляй ссылку:
       https://www.dong-chinese.com/dictionary/КАНДЗИ
       (подставляй только один разбираемый кандзи).
    
    Если пользователь пишет слово:
    - Разбирай КАЖДЫЙ кандзи отдельно по той же схеме.
    - В конце разбери результат сложения смыслов отдельных кандзи в общий смысл слова.
    
    Формат вывода для каждого кандзи:
    
    ## [漢]
    JLPT: ...
    Смысл: ...
    Радикалы:
    - ...
    - ...
    Объяснение сложения: ...
    Происхождение: ...
    Ссылка: https://www.dong-chinese.com/dictionary/漢
    
    Если приводишь пример:
    - Пиши пример на японском
    - Добавляй чтение хираганой
    - Добавляй перевод
    
    Пиши кратко, структурировано и без лишнего текста.
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
