#!/usr/bin/env node

// MCP Azure DevOps Server with PAT-only Authentication
// Combines Microsoft's comprehensive Azure DevOps tools with simple PAT authentication

import dotenv from "dotenv";
import { runServer, ServerConfig } from "./server.js";

// Load environment variables
dotenv.config();

function getConfig(): ServerConfig {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const personalAccessToken = process.env.AZURE_DEVOPS_PAT;

  if (!organizationUrl) {
    console.error("Error: AZURE_DEVOPS_ORG_URL environment variable is required");
    console.error("Example: https://dev.azure.com/your-organization");
    process.exit(1);
  }

  if (!personalAccessToken) {
    console.error("Error: AZURE_DEVOPS_PAT environment variable is required");
    console.error("Generate a PAT at: https://dev.azure.com/{org}/_usersSettings/tokens");
    console.error("");
    console.error("Required PAT scopes:");
    console.error("  - Code (Read & Write)");
    console.error("  - Work Items (Read & Write)");
    console.error("  - Build (Read & Execute)");
    console.error("  - Project and Team (Read)");
    console.error("  - Wiki (Read & Write)");
    console.error("  - Test Management (Read & Write)");
    process.exit(1);
  }

  return {
    organizationUrl,
    personalAccessToken,
  };
}

async function main() {
  try {
    const config = getConfig();
    console.error(`MCP Azure DevOps Server starting...`);
    console.error(`Organization: ${config.organizationUrl}`);
    console.error(`Authentication: PAT (Personal Access Token)`);
    await runServer(config);
  } catch (error) {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
