using JapanDict.Api.Extensions;
using JapanDict.Api.Middleware;
using JapanDict.Api.Models;
using JapanDict.Api.Services;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

// ── MongoDB / Cosmos DB ────────────────────────────────────────────────────
var mongoConnectionString = builder.Configuration["CosmosDb:ConnectionString"]
    ?? throw new InvalidOperationException("CosmosDb:ConnectionString is required.");
var databaseName = builder.Configuration["CosmosDb:DatabaseName"] ?? "japandict-db";

var mongoClient = new MongoClient(mongoConnectionString);
var database = mongoClient.GetDatabase(databaseName);

builder.Services.AddSingleton(database.GetCollection<AccessKey>("access_keys"));
builder.Services.AddSingleton(database.GetCollection<ChatSession>("chat_sessions"));
builder.Services.AddSingleton(database.GetCollection<KanjiEntry>("kanji_index"));

// ── Application services ───────────────────────────────────────────────────
builder.Services.AddSingleton<AzureAiService>();
builder.Services.AddSingleton<ChatSessionService>();
builder.Services.AddSingleton<KanjiIndexService>();

// ── Options ───────────────────────────────────────────────────────────────
builder.Services.Configure<SeedingOptions>(builder.Configuration.GetSection(SeedingOptions.SectionName));

// ── ASP.NET Core ───────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

// ── Seed test data ─────────────────────────────────────────────────────────
await app.Services.SeedDatabaseAsync(app.Logger);

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseHttpsRedirection();
app.UseApiKeyAuth();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();
