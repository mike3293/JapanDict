using JapanDict.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace JapanDict.Api.Controllers;

[ApiController]
[Route("api/kanji")]
public class KanjiController(KanjiIndexService kanjiService) : ControllerBase
{
    private string KeyId => HttpContext.Items["ApiKeyId"]?.ToString()
        ?? throw new InvalidOperationException("ApiKeyId not set by middleware.");

    // ── GET /api/kanji ─────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(await kanjiService.GetAllAsync(KeyId));

    // ── GET /api/kanji/search?q= ───────────────────────────────────────────
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Query parameter 'q' is required." });

        return Ok(await kanjiService.SearchAsync(KeyId, q));
    }
}
