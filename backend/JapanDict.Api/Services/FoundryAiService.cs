using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using JapanDict.Api.Options;
using Microsoft.Extensions.Options;

namespace JapanDict.Api.Services;

public class FoundryAiService
{
    private readonly HttpClient _httpClient;
    private readonly FoundryAiOptions _options;
    private readonly Uri _responsesEndpoint;

    private const string SystemPrompt =
    """
    Ты — эксперт по кандзи и этимологии.
    
    Если пользователь пишет ОДИН кандзи:
    1) Кратко укажи основной смысл.
    2) Разбери по РЕАЛЬНЫМ радикалам (не выдумывай, если радикал только для звучания, так и пиши).
    3) Объясни:
       - что означает каждый радикал,
       - почему он так выглядит, откуда образовалась форма,
       - как из их сложения получился общий смысл.
    4) В конце ОБЯЗАТЕЛЬНО добавляй ссылку в markdown формате:
       https://www.dong-chinese.com/dictionary/КАНДЗИ
       (подставляй только один разбираемый кандзи).
    
    Если пользователь пишет слово:
    - Разбирай КАЖДЫЙ кандзи отдельно по той же схеме. Не разбирай хирагану и катакану, только кандзи.
    - В конце разбери результат сложения смыслов отдельных кандзи в общий смысл слова и чтение.
    
    Формат вывода для каждого кандзи, обязательно используй []:
    
    # [漢]
    JLPT: ...
    Смысл: ...
    Радикалы:
    - ...
    - ...

    Объяснение сложения: ...
    Примеры слов: ...
    [dong chinese](https://www.dong-chinese.com/dictionary/漢)
    
    Если приводишь пример:
    - Пиши пример на японском
    - Добавляй чтение хираганой
    - Добавляй перевод
    
    Пиши кратко, структурировано и без лишнего текста.
    """;

    public FoundryAiService(HttpClient httpClient, IOptions<FoundryAiOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _responsesEndpoint = BuildResponsesEndpoint(_options.Endpoint);

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("FoundryAI:ApiKey is required.");

        if (string.IsNullOrWhiteSpace(_options.Model))
            throw new InvalidOperationException("FoundryAI:Model is required.");
    }

    public async IAsyncEnumerable<string> StreamAsync(
        IEnumerable<Models.ChatMessage> history,
        Action<string> onComplete,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var requestBody = new
        {
            model = _options.Model,
            instructions = SystemPrompt,
            input = BuildInput(history),
            stream = true
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, _responsesEndpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
        };

        request.Headers.Add("api-key", _options.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Foundry Responses API request failed with {(int)response.StatusCode} {response.ReasonPhrase}: {error}");
        }

        var accumulated = new StringBuilder();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);

            if (line is null)
                break;

            if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                continue;

            var data = line["data:".Length..].Trim();

            if (data.Length == 0 || data == "[DONE]")
                continue;

            var delta = TryReadOutputTextDelta(data);

            if (string.IsNullOrEmpty(delta))
                continue;

            accumulated.Append(delta);
            yield return delta;
        }

        onComplete(accumulated.ToString());
    }

    private static Uri BuildResponsesEndpoint(string endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint))
            throw new InvalidOperationException("FoundryAI:Endpoint is required.");

        var trimmed = endpoint.Trim().TrimEnd('/');
        var path = new Uri(trimmed, UriKind.Absolute).AbsolutePath.TrimEnd('/');

        if (path.EndsWith("/openai/v1/responses", StringComparison.OrdinalIgnoreCase))
            return new Uri(trimmed);

        if (path.EndsWith("/openai/v1", StringComparison.OrdinalIgnoreCase))
            return new Uri($"{trimmed}/responses");

        return new Uri($"{trimmed}/openai/v1/responses");
    }

    private static object[] BuildInput(IEnumerable<Models.ChatMessage> history) =>
        history
            .Where(msg => (msg.Role == "user" || msg.Role == "assistant")
                && !string.IsNullOrWhiteSpace(msg.Content))
            .Select(msg => new
            {
                role = msg.Role,
                content = msg.Content
            })
            .ToArray<object>();

    private static string? TryReadOutputTextDelta(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;

            if (root.TryGetProperty("type", out var type)
                && type.ValueKind == JsonValueKind.String
                && type.GetString() != "response.output_text.delta")
            {
                return null;
            }

            return root.TryGetProperty("delta", out var delta) && delta.ValueKind == JsonValueKind.String
                ? delta.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
