namespace JapanDict.Api.Options;

public class FoundryAiOptions
{
    public const string SectionName = "FoundryAI";

    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-5.4-mini";
}
