using System.Text.RegularExpressions;

namespace JapanDict.Api.Services;

public static partial class KanjiMetadataParser
{
    private static readonly Regex BlockRegex = MetadataRegex();

    public static IReadOnlyList<KanjiMetadata> Parse(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return [];

        var matches = BlockRegex.Matches(text);

        return matches
            .Select(m => new KanjiMetadata
            {
                Char = m.Groups["char"].Value.Trim(),
                Jlpt = m.Groups["jlpt"].Value.Trim(),
                Meaning = m.Groups["meaning"].Value.Trim()
            })
            .ToList();
    }

    [GeneratedRegex(@"\[(?<char>.)\][\s\S]*?
               JLPT:\s*(?<jlpt>[^\r\n]+)[\s\S]*?
               Смысл:\s*(?<meaning>[^\r\n]+)", RegexOptions.Multiline | RegexOptions.Compiled | RegexOptions.IgnorePatternWhitespace)]
    private static partial Regex MetadataRegex();

    public sealed class KanjiMetadata
    {
        public string Char { get; init; } = string.Empty;
        public string Jlpt { get; init; } = string.Empty;
        public string Meaning { get; init; } = string.Empty;
    }
}