import * as pulumi from '@pulumi/pulumi';
import * as azure from '@pulumi/azure-native';

const backendVersion = process.env.BACKEND_VERSION || 'latest';
const dockerUsername = process.env.DOCKER_USERNAME!;

// ── Resource Group ────────────────────────────────────────────────────────
const resourceGroup = new azure.resources.ResourceGroup('japandict-rg', {
    resourceGroupName: 'japandict-rg',
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

// ── Azure OpenAI ──────────────────────────────────────────────────────────
// customSubDomainName must be globally unique and lowercase (max 24 chars).
const openAiSubdomain = 'japandict-ai';

const openAiAccount = new azure.cognitiveservices.Account('japandict-openai', {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: 'OpenAI',
    sku: { name: 'S0' },
    properties: {
        customSubDomainName: openAiSubdomain,
        publicNetworkAccess: 'Enabled',
    },
});

// GPT-4o deployment
const gpt4oDeployment = new azure.cognitiveservices.Deployment('gpt-4o-deployment', {
    resourceGroupName: resourceGroup.name,
    accountName: openAiAccount.name,
    deploymentName: 'gpt-4o',
    properties: {
        model: {
            format: 'OpenAI',
            name: 'gpt-4o',
            version: '2024-11-20',
        },
    },
    sku: {
        name: 'Standard',
        capacity: 10,
    },
}, { dependsOn: [openAiAccount] });

// Retrieve the OpenAI API key at deploy time
const openAiKeys = pulumi
    .all([resourceGroup.name, openAiAccount.name])
    .apply(([rg, acc]) =>
        azure.cognitiveservices.listAccountKeys({
            resourceGroupName: rg,
            accountName: acc,
        }));

const openAiKey = openAiKeys.apply(k => k.key1!);
const openAiEndpoint = pulumi.interpolate`https://${openAiSubdomain}.openai.azure.com/`;

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
                name: 'AzureOpenAI__Endpoint',
                value: openAiEndpoint,
            },
            {
                name: 'AzureOpenAI__ApiKey',
                value: openAiKey,
            },
            {
                name: 'AzureOpenAI__DeploymentName',
                value: 'gpt-4o',
            },
        ],
    },
    httpsOnly: true,
}, { dependsOn: [appServicePlan, cosmosDb, gpt4oDeployment] });

// ── Outputs ───────────────────────────────────────────────────────────────
export const apiUrl = pulumi.interpolate`https://${apiApp.defaultHostName}`;
export const cosmosAccountName = cosmosAccount.name;
export const openAiAccountName = openAiAccount.name;
