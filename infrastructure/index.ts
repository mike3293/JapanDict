import * as pulumi from '@pulumi/pulumi';
import * as azure from '@pulumi/azure-native';

const backendVersion = process.env.BACKEND_VERSION || 'latest';
const dockerUsername = process.env.DOCKER_USERNAME!;

// ── Resource Group ────────────────────────────────────────────────────────
const resourceGroup = new azure.resources.ResourceGroup('japandict-rg', {
    resourceGroupName: 'japandict-rg',
    location: 'polandcentral',
});

// ── Cosmos DB (MongoDB API, Free Tier) ────────────────────────────────────
const cosmosAccount = new azure.documentdb.DatabaseAccount('japandict-db-account', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    databaseAccountOfferType: 'Standard',
    locations: [{ locationName: resourceGroup.location }],
    kind: 'MongoDB',
    capabilities: [{ name: 'EnableMongo' }],
    enableFreeTier: true,
    apiProperties: { serverVersion: '7.0' },
});

const cosmosDb = new azure.documentdb.MongoDBResourceMongoDBDatabase('japandict-db', {
    resourceGroupName: resourceGroup.name,
    accountName: cosmosAccount.name,
    databaseName: 'japandict-db',
    resource: { id: 'japandict-db' },
}, { dependsOn: [cosmosAccount] });

const cosmosConnStrings = pulumi
    .all([resourceGroup.name, cosmosAccount.name])
    .apply(([rg, acc]) =>
        azure.documentdb.listDatabaseAccountConnectionStrings({
            resourceGroupName: rg,
            accountName: acc,
        }));

const cosmosConnString = cosmosConnStrings.apply(cs => cs.connectionStrings![0].connectionString);

// ── Microsoft Foundry / Azure AI Services ─────────────────────────────────
// customSubDomainName must be globally unique and lowercase.
const foundrySubdomain = 'japandict';
const foundryModelName = 'gpt-5.4-mini';

const foundryAccount = new azure.cognitiveservices.Account('japandict-foundry', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: 'AIServices',
    sku: { name: 'S0' },
    properties: {
        customSubDomainName: foundrySubdomain,
        publicNetworkAccess: 'Enabled',
    },
});

// GPT-5.4 mini deployment
const miniDeployment = new azure.cognitiveservices.Deployment('gpt-5-4-mini-deployment', {
    resourceGroupName: resourceGroup.name,
    accountName: foundryAccount.name,
    deploymentName: foundryModelName,
    properties: {
        model: {
            format: 'OpenAI',
            name: foundryModelName,
            version: '2026-03-17',
        },
    },
    sku: {
        name: 'GlobalStandard',
        capacity: 1000,
    },
}, { dependsOn: [foundryAccount] });

// Retrieve the Foundry API key at deploy time
const foundryKeys = pulumi
    .all([resourceGroup.name, foundryAccount.name, miniDeployment.id])
    .apply(([rg, acc]) =>
        azure.cognitiveservices.listAccountKeys({
            resourceGroupName: rg,
            accountName: acc,
        }));

const foundryKey = foundryKeys.apply(k => k.key1!);
const foundryEndpoint = pulumi.interpolate`https://${foundrySubdomain}.services.ai.azure.com/openai/v1/responses`;

// ── App Service Plan (Linux free tier) ────────────────────────────────────
const appServicePlan = new azure.web.AppServicePlan('japandict-plan', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: { name: 'F1', tier: 'Free' },
    kind: 'Linux',
    reserved: true,
});

// ── App Service (Backend) ─────────────────────────────────────────────────
const apiApp = new azure.web.WebApp('japandict-api', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: appServicePlan.id,
    siteConfig: {
        alwaysOn: false,
        linuxFxVersion: pulumi.interpolate`DOCKER|${dockerUsername}/japandict-api:${backendVersion}`,
        appSettings: [
            {
                name: 'DOCKER_REGISTRY_SERVER_URL',
                value: 'https://index.docker.io',
            },
            {
                name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE',
                value: 'false',
            },
            {
                name: 'CosmosDb__ConnectionString',
                value: cosmosConnString,
            },
            {
                name: 'CosmosDb__DatabaseName',
                value: 'japandict-db',
            },
            {
                name: 'AccessKeys',
                value: process.env.ACCESS_KEYS!,
            },
            {
                name: 'FoundryAI__Endpoint',
                value: foundryEndpoint,
            },
            {
                name: 'FoundryAI__ApiKey',
                value: foundryKey,
            },
            {
                name: 'FoundryAI__Model',
                value: foundryModelName,
            },
        ],
    },
    httpsOnly: true,
}, { dependsOn: [appServicePlan, cosmosDb, miniDeployment] });

// ── Outputs ───────────────────────────────────────────────────────────────
export const apiUrl = pulumi.interpolate`https://${apiApp.defaultHostName}`;
export const cosmosAccountName = cosmosAccount.name;
export const foundryAccountName = foundryAccount.name;
export const foundryResponsesEndpoint = foundryEndpoint;
