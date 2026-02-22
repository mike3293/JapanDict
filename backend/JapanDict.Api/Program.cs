using JapanDict.Api.Extensions;
using JapanDict.Api.Middleware;
using JapanDict.Api.Models;
using JapanDict.Api.Options;
using JapanDict.Api.Services;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

// ── Options ───────────────────────────────────────────────────────────────
builder.Services.Configure<CosmosDbOptions>(builder.Configuration.GetSection(CosmosDbOptions.SectionName));
builder.Services.Configure<AzureOpenAIOptions>(builder.Configuration.GetSection(AzureOpenAIOptions.SectionName));
builder.Services.Configure<SeedingOptions>(builder.Configuration.GetSection(SeedingOptions.SectionName));

// ── MongoDB / Cosmos DB ────────────────────────────────────────────────────
var cosmosDbOptions = builder.Configuration.GetSection(CosmosDbOptions.SectionName).Get<CosmosDbOptions>()
    ?? throw new InvalidOperationException("CosmosDb configuration is required.");

var mongoClient = new MongoClient(cosmosDbOptions.ConnectionString);
var database = mongoClient.GetDatabase(cosmosDbOptions.DatabaseName);

builder.Services.AddSingleton(database.GetCollection<AccessKey>("access_keys"));
builder.Services.AddSingleton(database.GetCollection<ChatSession>("chat_sessions"));
builder.Services.AddSingleton(database.GetCollection<KanjiEntry>("kanji_index"));

// ── Application services ───────────────────────────────────────────────────
builder.Services.AddSingleton<AzureAiService>();
builder.Services.AddSingleton<ChatSessionService>();
builder.Services.AddSingleton<KanjiIndexService>();

// ── ASP.NET Core ───────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

// ── Seed test data ─────────────────────────────────────────────────────────
await app.Services.SeedDatabaseAsync();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseHttpsRedirection();
app.UseApiKeyAuth();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
