// PAT-only Authentication Module
// Based on mcp-server-azure-devops implementation

import { getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";

export interface AuthConfig {
  organizationUrl: string;
  personalAccessToken: string;
}

/**
 * Creates an authenticated Azure DevOps WebApi client using PAT authentication.
 *
 * PAT authentication uses HTTP Basic Authentication with:
 * - Username: empty string
 * - Password: the PAT token
 * - Header format: Basic base64(':' + PAT)
 */
export async function createPatClient(config: AuthConfig): Promise<WebApi> {
  if (!config.personalAccessToken) {
    throw new Error("Personal Access Token is required for authentication");
  }

  if (!config.organizationUrl) {
    throw new Error("Organization URL is required");
  }

  // Create authentication handler using PAT
  const authHandler = getPersonalAccessTokenHandler(config.personalAccessToken);

  // Create and return the WebApi client
  return new WebApi(config.organizationUrl, authHandler);
}

/**
 * Generates a Basic Authorization header from a PAT token.
 * Used for direct REST API calls.
 */
export function getPatAuthHeader(pat: string): string {
  const base64Token = Buffer.from(`:${pat}`).toString("base64");
  return `Basic ${base64Token}`;
}

/**
 * Azure DevOps client wrapper that provides lazy-loaded access to various APIs.
 */
export class AzureDevOpsClient {
  private config: AuthConfig;
  private clientPromise: Promise<WebApi> | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  private async getClient(): Promise<WebApi> {
    if (!this.clientPromise) {
      this.clientPromise = createPatClient(this.config);
    }
    return this.clientPromise;
  }

  public async getWebApiClient(): Promise<WebApi> {
    return this.getClient();
  }

  public async getCoreApi() {
    const client = await this.getClient();
    return client.getCoreApi();
  }

  public async getGitApi() {
    const client = await this.getClient();
    return client.getGitApi();
  }

  public async getWorkItemTrackingApi() {
    const client = await this.getClient();
    return client.getWorkItemTrackingApi();
  }

  public async getWorkApi() {
    const client = await this.getClient();
    return client.getWorkApi();
  }

  public async getBuildApi() {
    const client = await this.getClient();
    return client.getBuildApi();
  }

  public async getPipelinesApi() {
    const client = await this.getClient();
    return client.getPipelinesApi();
  }

  public async getWikiApi() {
    const client = await this.getClient();
    return client.getWikiApi();
  }

  public async getTestApi() {
    const client = await this.getClient();
    return client.getTestApi();
  }

  public async getTestPlanApi() {
    const client = await this.getClient();
    return client.getTestPlanApi();
  }

  public async getTestResultsApi() {
    const client = await this.getClient();
    return client.getTestResultsApi();
  }

  public async getAlertApi() {
    const client = await this.getClient();
    return client.getAlertApi();
  }

  public get serverUrl(): string {
    return this.config.organizationUrl;
  }

  public get pat(): string {
    return this.config.personalAccessToken;
  }
}
