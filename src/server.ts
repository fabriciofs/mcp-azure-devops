// MCP Server for Azure DevOps with PAT-only authentication
// Combines Microsoft's comprehensive tools with simple PAT auth
// Total: 83 tools

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebApi } from "azure-devops-node-api";

import { AzureDevOpsClient, getPatAuthHeader } from "./shared/auth.js";
import {
  apiVersion,
  batchApiVersion,
  getEnumKeys,
  safeEnumConvert,
  encodeFormattedValue,
  getUserAgent,
  streamToString,
  mapStringToEnum,
  mapStringArrayToEnum,
} from "./utils/index.js";

// Import Azure DevOps interfaces
import {
  PullRequestStatus,
  CommentThreadStatus,
  GitPullRequestCommentThread,
  Comment,
  VersionControlRecursionType,
} from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { WorkItemExpand, QueryExpand } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import { BuildQueryOrder, DefinitionQueryOrder, StageUpdateType } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { ConfigurationType, RepositoryType } from "azure-devops-node-api/interfaces/PipelinesInterfaces.js";
import { WikiPagesBatchRequest } from "azure-devops-node-api/interfaces/WikiInterfaces.js";
import { TreeStructureGroup, TreeNodeStructureType } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import { SuiteExpand, TestPlanCreateParams } from "azure-devops-node-api/interfaces/TestPlanInterfaces.js";
import { AlertType, Confidence, Severity, State } from "azure-devops-node-api/interfaces/AlertInterfaces.js";
import { mkdirSync, createWriteStream } from "fs";
import { join, resolve } from "path";

export interface ServerConfig {
  organizationUrl: string;
  personalAccessToken: string;
}

let orgName: string = "";

export function createServer(config: ServerConfig) {
  if (!config.organizationUrl) {
    throw new Error("Organization URL is required");
  }
  if (!config.personalAccessToken) {
    throw new Error("Personal Access Token (PAT) is required");
  }

  const urlParts = config.organizationUrl.split("/");
  orgName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || "";

  const client = new AzureDevOpsClient({
    organizationUrl: config.organizationUrl,
    personalAccessToken: config.personalAccessToken,
  });

  const server = new Server(
    { name: "mcp-azure-devops", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const tokenProvider = async () => config.personalAccessToken;
  const connectionProvider = async () => client.getWebApiClient();
  const userAgentProvider = () => getUserAgent();
  const getAuthHeader = () => getPatAuthHeader(config.personalAccessToken);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getAllToolDefinitions(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const connection = await connectionProvider();
      return await handleToolCall(name, args || {}, connection, tokenProvider, connectionProvider, userAgentProvider, getAuthHeader);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return { content: [{ type: "text", text: `Error: ${errorMessage}` }], isError: true };
    }
  });

  return server;
}

function getAllToolDefinitions() {
  return [
    // ==================== CORE TOOLS (3) ====================
    {
      name: "core_list_project_teams",
      description: "Retrieve a list of teams for the specified Azure DevOps project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "The name or ID of the Azure DevOps project." },
          mine: { type: "boolean", description: "If true, only return teams that the authenticated user is a member of." },
          top: { type: "number", description: "Maximum number of teams to return." },
          skip: { type: "number", description: "Number of teams to skip for pagination." },
        },
        required: ["project"],
      },
    },
    {
      name: "core_list_projects",
      description: "Retrieve a list of projects in your Azure DevOps organization.",
      inputSchema: {
        type: "object",
        properties: {
          stateFilter: { type: "string", enum: ["all", "wellFormed", "createPending", "deleted"], description: "Filter projects by state." },
          top: { type: "number", description: "Maximum number of projects to return." },
          skip: { type: "number", description: "Number of projects to skip." },
          projectNameFilter: { type: "string", description: "Filter projects by name." },
        },
      },
    },
    {
      name: "core_get_identity_ids",
      description: "Retrieve Azure DevOps identity IDs for a provided search filter.",
      inputSchema: {
        type: "object",
        properties: {
          searchFilter: { type: "string", description: "Search filter (unique name, display name, email)." },
        },
        required: ["searchFilter"],
      },
    },

    // ==================== REPOSITORY TOOLS (18) ====================
    {
      name: "repo_list_repos_by_project",
      description: "Retrieve a list of repositories for a given project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "The project name or ID." },
          top: { type: "number", description: "Maximum repositories to return." },
          skip: { type: "number", description: "Repositories to skip." },
          repoNameFilter: { type: "string", description: "Filter by name." },
        },
        required: ["project"],
      },
    },
    {
      name: "repo_get_repo_by_name_or_id",
      description: "Get a repository by its name or ID.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository name or ID." },
          project: { type: "string", description: "The project name or ID." },
        },
        required: ["repositoryId"],
      },
    },
    {
      name: "repo_list_branches_by_repo",
      description: "Retrieve a list of branches for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          top: { type: "number", description: "Maximum branches to return." },
          filterContains: { type: "string", description: "Filter branches by name." },
        },
        required: ["repositoryId"],
      },
    },
    {
      name: "repo_list_my_branches_by_repo",
      description: "Retrieve branches created by the authenticated user.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          top: { type: "number", description: "Maximum branches to return." },
        },
        required: ["repositoryId"],
      },
    },
    {
      name: "repo_get_branch_by_name",
      description: "Get a branch by its name.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          branchName: { type: "string", description: "The branch name." },
        },
        required: ["repositoryId", "branchName"],
      },
    },
    {
      name: "repo_create_branch",
      description: "Create a new branch in the repository.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          branchName: { type: "string", description: "The new branch name." },
          sourceBranchName: { type: "string", description: "The source branch name." },
          sourceCommitId: { type: "string", description: "The commit ID to branch from." },
        },
        required: ["repositoryId", "branchName"],
      },
    },
    {
      name: "repo_list_pull_requests_by_repo_or_project",
      description: "Retrieve pull requests for a repository or project.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          project: { type: "string", description: "The project ID." },
          top: { type: "number", description: "Maximum PRs to return." },
          skip: { type: "number", description: "PRs to skip." },
          status: { type: "string", enum: ["Active", "Abandoned", "Completed", "All", "NotSet"], description: "Filter by status." },
        },
      },
    },
    {
      name: "repo_get_pull_request_by_id",
      description: "Get a pull request by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          includeWorkItemRefs: { type: "boolean", description: "Include work item references." },
        },
        required: ["repositoryId", "pullRequestId"],
      },
    },
    {
      name: "repo_create_pull_request",
      description: "Create a new pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          sourceRefName: { type: "string", description: "Source branch (refs/heads/...)." },
          targetRefName: { type: "string", description: "Target branch (refs/heads/...)." },
          title: { type: "string", description: "PR title." },
          description: { type: "string", description: "PR description." },
          isDraft: { type: "boolean", description: "Create as draft." },
          reviewers: { type: "array", items: { type: "string" }, description: "Reviewer IDs." },
        },
        required: ["repositoryId", "sourceRefName", "targetRefName", "title"],
      },
    },
    {
      name: "repo_update_pull_request",
      description: "Update an existing pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          title: { type: "string", description: "New title." },
          description: { type: "string", description: "New description." },
          status: { type: "string", enum: ["active", "abandoned", "completed"], description: "New status." },
          targetRefName: { type: "string", description: "New target branch." },
        },
        required: ["repositoryId", "pullRequestId"],
      },
    },
    {
      name: "repo_update_pull_request_reviewers",
      description: "Add or update reviewers on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          reviewerId: { type: "string", description: "The reviewer ID." },
          vote: { type: "number", description: "Vote: 10=approved, 5=approved with suggestions, 0=no vote, -5=waiting, -10=rejected." },
          isRequired: { type: "boolean", description: "Is required reviewer." },
        },
        required: ["repositoryId", "pullRequestId", "reviewerId"],
      },
    },
    {
      name: "repo_list_pull_request_threads",
      description: "List comment threads on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
        },
        required: ["repositoryId", "pullRequestId"],
      },
    },
    {
      name: "repo_list_pull_request_thread_comments",
      description: "List comments in a specific thread.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          threadId: { type: "number", description: "The thread ID." },
        },
        required: ["repositoryId", "pullRequestId", "threadId"],
      },
    },
    {
      name: "repo_create_pull_request_thread",
      description: "Create a new comment thread on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          content: { type: "string", description: "Comment content." },
          status: { type: "string", enum: ["active", "fixed", "wontFix", "closed", "pending"], description: "Thread status." },
          filePath: { type: "string", description: "File path for inline comment." },
          lineNumber: { type: "number", description: "Line number for inline comment." },
        },
        required: ["repositoryId", "pullRequestId", "content"],
      },
    },
    {
      name: "repo_update_pull_request_thread",
      description: "Update a comment thread status.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          threadId: { type: "number", description: "The thread ID." },
          status: { type: "string", enum: ["active", "fixed", "wontFix", "closed", "pending"], description: "New status." },
        },
        required: ["repositoryId", "pullRequestId", "threadId", "status"],
      },
    },
    {
      name: "repo_reply_to_comment",
      description: "Reply to an existing comment thread.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          pullRequestId: { type: "number", description: "The pull request ID." },
          threadId: { type: "number", description: "The thread ID." },
          content: { type: "string", description: "Reply content." },
        },
        required: ["repositoryId", "pullRequestId", "threadId", "content"],
      },
    },
    {
      name: "repo_search_commits",
      description: "Search for commits in a repository.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          project: { type: "string", description: "The project name or ID." },
          searchText: { type: "string", description: "Search text for commit messages." },
          author: { type: "string", description: "Filter by author." },
          fromDate: { type: "string", description: "From date (ISO format)." },
          toDate: { type: "string", description: "To date (ISO format)." },
          top: { type: "number", description: "Maximum commits to return." },
        },
        required: ["repositoryId"],
      },
    },
    {
      name: "repo_list_pull_requests_by_commits",
      description: "Get pull requests associated with specific commits.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryId: { type: "string", description: "The repository ID." },
          project: { type: "string", description: "The project name or ID." },
          commitIds: { type: "array", items: { type: "string" }, description: "Commit IDs." },
        },
        required: ["repositoryId", "commitIds"],
      },
    },

    // ==================== WORK ITEM TOOLS (21) ====================
    {
      name: "wit_get_work_item",
      description: "Get a single work item by ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Work item ID." },
          project: { type: "string", description: "Project name or ID." },
          fields: { type: "array", items: { type: "string" }, description: "Fields to include." },
          expand: { type: "string", enum: ["all", "fields", "links", "none", "relations"], description: "Expand options." },
        },
        required: ["id"],
      },
    },
    {
      name: "wit_get_work_items_batch_by_ids",
      description: "Get multiple work items by IDs.",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "number" }, description: "Work item IDs." },
          project: { type: "string", description: "Project name or ID." },
          fields: { type: "array", items: { type: "string" }, description: "Fields to include." },
          expand: { type: "string", enum: ["all", "fields", "links", "none", "relations"], description: "Expand options." },
        },
        required: ["ids"],
      },
    },
    {
      name: "wit_create_work_item",
      description: "Create a new work item.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          workItemType: { type: "string", description: "Work item type." },
          fields: { type: "array", items: { type: "object" }, description: "Fields to set." },
        },
        required: ["project", "workItemType", "fields"],
      },
    },
    {
      name: "wit_update_work_item",
      description: "Update a work item.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Work item ID." },
          updates: { type: "array", items: { type: "object" }, description: "Updates to apply." },
        },
        required: ["id", "updates"],
      },
    },
    {
      name: "wit_update_work_items_batch",
      description: "Update multiple work items in batch.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          workItems: { type: "array", items: { type: "object" }, description: "Work items with updates." },
        },
        required: ["project", "workItems"],
      },
    },
    {
      name: "wit_my_work_items",
      description: "Retrieve work items relevant to the authenticated user.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          type: { type: "string", enum: ["assignedtome", "myactivity"], description: "Query type." },
          top: { type: "number", description: "Maximum items." },
        },
        required: ["project"],
      },
    },
    {
      name: "wit_list_backlogs",
      description: "List backlogs for a team.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
        },
        required: ["project", "team"],
      },
    },
    {
      name: "wit_list_backlog_work_items",
      description: "List work items in a backlog.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          backlogId: { type: "string", description: "Backlog ID." },
        },
        required: ["project", "team", "backlogId"],
      },
    },
    {
      name: "wit_list_work_item_comments",
      description: "List comments on a work item.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          workItemId: { type: "number", description: "Work item ID." },
        },
        required: ["project", "workItemId"],
      },
    },
    {
      name: "wit_add_work_item_comment",
      description: "Add a comment to a work item.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          workItemId: { type: "number", description: "Work item ID." },
          text: { type: "string", description: "Comment text." },
        },
        required: ["project", "workItemId", "text"],
      },
    },
    {
      name: "wit_list_work_item_revisions",
      description: "List revisions of a work item.",
      inputSchema: {
        type: "object",
        properties: {
          workItemId: { type: "number", description: "Work item ID." },
          top: { type: "number", description: "Maximum revisions." },
          skip: { type: "number", description: "Revisions to skip." },
        },
        required: ["workItemId"],
      },
    },
    {
      name: "wit_get_work_items_for_iteration",
      description: "Get work items for a specific iteration.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          iterationId: { type: "string", description: "Iteration ID." },
        },
        required: ["project", "team", "iterationId"],
      },
    },
    {
      name: "wit_add_child_work_items",
      description: "Add child work items to a parent.",
      inputSchema: {
        type: "object",
        properties: {
          parentId: { type: "number", description: "Parent work item ID." },
          childIds: { type: "array", items: { type: "number" }, description: "Child work item IDs." },
        },
        required: ["parentId", "childIds"],
      },
    },
    {
      name: "wit_work_items_link",
      description: "Create a link between work items.",
      inputSchema: {
        type: "object",
        properties: {
          sourceId: { type: "number", description: "Source work item ID." },
          targetId: { type: "number", description: "Target work item ID." },
          linkType: { type: "string", description: "Link type (parent, child, related, etc)." },
          comment: { type: "string", description: "Link comment." },
        },
        required: ["sourceId", "targetId", "linkType"],
      },
    },
    {
      name: "wit_work_item_unlink",
      description: "Remove a link between work items.",
      inputSchema: {
        type: "object",
        properties: {
          sourceId: { type: "number", description: "Source work item ID." },
          targetId: { type: "number", description: "Target work item ID." },
          linkType: { type: "string", description: "Link type to remove." },
        },
        required: ["sourceId", "targetId", "linkType"],
      },
    },
    {
      name: "wit_link_work_item_to_pull_request",
      description: "Link a work item to a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          workItemId: { type: "number", description: "Work item ID." },
          repositoryId: { type: "string", description: "Repository ID." },
          pullRequestId: { type: "number", description: "Pull request ID." },
        },
        required: ["workItemId", "repositoryId", "pullRequestId"],
      },
    },
    {
      name: "wit_add_artifact_link",
      description: "Add an artifact link to a work item.",
      inputSchema: {
        type: "object",
        properties: {
          workItemId: { type: "number", description: "Work item ID." },
          artifactUri: { type: "string", description: "Artifact URI." },
          linkType: { type: "string", description: "Link type." },
          comment: { type: "string", description: "Comment." },
        },
        required: ["workItemId", "artifactUri"],
      },
    },
    {
      name: "wit_get_work_item_type",
      description: "Get work item type definition.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          type: { type: "string", description: "Work item type name." },
        },
        required: ["project", "type"],
      },
    },
    {
      name: "wit_get_query",
      description: "Get a saved query by path or ID.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          queryPath: { type: "string", description: "Query path or ID." },
          expand: { type: "string", enum: ["all", "clauses", "minimal", "none", "wiql"], description: "Expand options." },
        },
        required: ["project", "queryPath"],
      },
    },
    {
      name: "wit_get_query_results_by_id",
      description: "Execute a saved query and get results.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          queryId: { type: "string", description: "Query ID." },
          team: { type: "string", description: "Team name or ID." },
        },
        required: ["project", "queryId"],
      },
    },

    // ==================== PIPELINE TOOLS (14) ====================
    {
      name: "pipelines_get_builds",
      description: "Retrieves a list of builds for a given project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          definitions: { type: "array", items: { type: "number" }, description: "Definition IDs to filter." },
          top: { type: "number", description: "Maximum builds." },
          branchName: { type: "string", description: "Branch name filter." },
          buildNumber: { type: "string", description: "Build number filter." },
          statusFilter: { type: "number", description: "Status filter." },
          resultFilter: { type: "number", description: "Result filter." },
        },
        required: ["project"],
      },
    },
    {
      name: "pipelines_get_build_changes",
      description: "Get the changes associated with a build.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
          top: { type: "number", description: "Maximum changes." },
        },
        required: ["project", "buildId"],
      },
    },
    {
      name: "pipelines_get_build_definitions",
      description: "Retrieves build definitions for a project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          name: { type: "string", description: "Filter by name." },
          repositoryId: { type: "string", description: "Filter by repository." },
          repositoryType: { type: "string", enum: ["TfsGit", "GitHub", "BitbucketCloud"], description: "Repository type." },
          top: { type: "number", description: "Maximum definitions." },
          path: { type: "string", description: "Filter by path." },
        },
        required: ["project"],
      },
    },
    {
      name: "pipelines_get_build_definition_revisions",
      description: "Get revisions of a build definition.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          definitionId: { type: "number", description: "Definition ID." },
        },
        required: ["project", "definitionId"],
      },
    },
    {
      name: "pipelines_get_build_log",
      description: "Retrieves logs for a build.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
        },
        required: ["project", "buildId"],
      },
    },
    {
      name: "pipelines_get_build_log_by_id",
      description: "Get a specific build log by log ID.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
          logId: { type: "number", description: "Log ID." },
          startLine: { type: "number", description: "Start line." },
          endLine: { type: "number", description: "End line." },
        },
        required: ["project", "buildId", "logId"],
      },
    },
    {
      name: "pipelines_get_build_status",
      description: "Get the status of a build.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
        },
        required: ["project", "buildId"],
      },
    },
    {
      name: "pipelines_update_build_stage",
      description: "Update a build stage (retry, cancel).",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
          stageName: { type: "string", description: "Stage name." },
          status: { type: "string", description: "New status (Retry, Cancel)." },
          forceRetryAllJobs: { type: "boolean", description: "Force retry all jobs." },
        },
        required: ["project", "buildId", "stageName", "status"],
      },
    },
    {
      name: "pipelines_create_pipeline",
      description: "Create a new pipeline.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          name: { type: "string", description: "Pipeline name." },
          folder: { type: "string", description: "Folder path." },
          yamlPath: { type: "string", description: "Path to YAML file." },
          repositoryType: { type: "string", description: "Repository type." },
          repositoryName: { type: "string", description: "Repository name." },
          repositoryId: { type: "string", description: "Repository ID." },
        },
        required: ["project", "name", "yamlPath", "repositoryType", "repositoryName"],
      },
    },
    {
      name: "pipelines_get_run",
      description: "Get a specific pipeline run.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          pipelineId: { type: "number", description: "Pipeline ID." },
          runId: { type: "number", description: "Run ID." },
        },
        required: ["project", "pipelineId", "runId"],
      },
    },
    {
      name: "pipelines_list_runs",
      description: "List runs for a pipeline.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          pipelineId: { type: "number", description: "Pipeline ID." },
        },
        required: ["project", "pipelineId"],
      },
    },
    {
      name: "pipelines_run_pipeline",
      description: "Start a new pipeline run.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          pipelineId: { type: "number", description: "Pipeline ID." },
          templateParameters: { type: "object", description: "Template parameters." },
          stagesToSkip: { type: "array", items: { type: "string" }, description: "Stages to skip." },
          variables: { type: "object", description: "Variables." },
        },
        required: ["project", "pipelineId"],
      },
    },
    {
      name: "pipelines_list_artifacts",
      description: "List artifacts for a build.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
        },
        required: ["project", "buildId"],
      },
    },
    {
      name: "pipelines_download_artifact",
      description: "Download a build artifact.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
          artifactName: { type: "string", description: "Artifact name." },
          destinationPath: { type: "string", description: "Local path to save." },
        },
        required: ["project", "buildId", "artifactName"],
      },
    },

    // ==================== WIKI TOOLS (6) ====================
    {
      name: "wiki_list_wikis",
      description: "List wikis for a project or organization.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
        },
      },
    },
    {
      name: "wiki_get_wiki",
      description: "Get a specific wiki by identifier.",
      inputSchema: {
        type: "object",
        properties: {
          wikiIdentifier: { type: "string", description: "Wiki identifier." },
          project: { type: "string", description: "Project name or ID." },
        },
        required: ["wikiIdentifier"],
      },
    },
    {
      name: "wiki_list_pages",
      description: "List pages in a wiki.",
      inputSchema: {
        type: "object",
        properties: {
          wikiIdentifier: { type: "string", description: "Wiki identifier." },
          project: { type: "string", description: "Project name or ID." },
          top: { type: "number", description: "Maximum pages." },
          continuationToken: { type: "string", description: "Continuation token." },
        },
        required: ["wikiIdentifier", "project"],
      },
    },
    {
      name: "wiki_get_page",
      description: "Get wiki page metadata.",
      inputSchema: {
        type: "object",
        properties: {
          wikiIdentifier: { type: "string", description: "Wiki identifier." },
          project: { type: "string", description: "Project name or ID." },
          path: { type: "string", description: "Page path." },
          recursionLevel: { type: "string", enum: ["None", "OneLevel", "Full"], description: "Recursion level." },
        },
        required: ["wikiIdentifier", "project", "path"],
      },
    },
    {
      name: "wiki_get_page_content",
      description: "Get wiki page content.",
      inputSchema: {
        type: "object",
        properties: {
          wikiIdentifier: { type: "string", description: "Wiki identifier." },
          project: { type: "string", description: "Project name or ID." },
          path: { type: "string", description: "Page path." },
        },
        required: ["wikiIdentifier", "project"],
      },
    },
    {
      name: "wiki_create_or_update_page",
      description: "Create or update a wiki page.",
      inputSchema: {
        type: "object",
        properties: {
          wikiIdentifier: { type: "string", description: "Wiki identifier." },
          project: { type: "string", description: "Project name or ID." },
          path: { type: "string", description: "Page path." },
          content: { type: "string", description: "Page content (markdown)." },
          etag: { type: "string", description: "ETag for updates." },
        },
        required: ["wikiIdentifier", "path", "content"],
      },
    },

    // ==================== SEARCH TOOLS (3) ====================
    {
      name: "search_code",
      description: "Search for code in repositories.",
      inputSchema: {
        type: "object",
        properties: {
          searchText: { type: "string", description: "Search text." },
          project: { type: "array", items: { type: "string" }, description: "Filter by projects." },
          repository: { type: "array", items: { type: "string" }, description: "Filter by repositories." },
          path: { type: "array", items: { type: "string" }, description: "Filter by paths." },
          branch: { type: "array", items: { type: "string" }, description: "Filter by branches." },
          top: { type: "number", description: "Maximum results." },
          skip: { type: "number", description: "Results to skip." },
        },
        required: ["searchText"],
      },
    },
    {
      name: "search_wiki",
      description: "Search for wiki content.",
      inputSchema: {
        type: "object",
        properties: {
          searchText: { type: "string", description: "Search text." },
          project: { type: "array", items: { type: "string" }, description: "Filter by projects." },
          wiki: { type: "array", items: { type: "string" }, description: "Filter by wikis." },
          top: { type: "number", description: "Maximum results." },
          skip: { type: "number", description: "Results to skip." },
        },
        required: ["searchText"],
      },
    },
    {
      name: "search_workitem",
      description: "Search for work items.",
      inputSchema: {
        type: "object",
        properties: {
          searchText: { type: "string", description: "Search text." },
          project: { type: "array", items: { type: "string" }, description: "Filter by projects." },
          workItemType: { type: "array", items: { type: "string" }, description: "Filter by work item types." },
          state: { type: "array", items: { type: "string" }, description: "Filter by states." },
          assignedTo: { type: "array", items: { type: "string" }, description: "Filter by assigned users." },
          top: { type: "number", description: "Maximum results." },
          skip: { type: "number", description: "Results to skip." },
        },
        required: ["searchText"],
      },
    },

    // ==================== TEST PLAN TOOLS (9) ====================
    {
      name: "testplan_list_test_plans",
      description: "List test plans in a project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          filterActivePlans: { type: "boolean", description: "Filter active plans only." },
          includePlanDetails: { type: "boolean", description: "Include plan details." },
          continuationToken: { type: "string", description: "Continuation token." },
        },
        required: ["project"],
      },
    },
    {
      name: "testplan_create_test_plan",
      description: "Create a new test plan.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          name: { type: "string", description: "Test plan name." },
          iteration: { type: "string", description: "Iteration path." },
          description: { type: "string", description: "Description." },
          startDate: { type: "string", description: "Start date (ISO)." },
          endDate: { type: "string", description: "End date (ISO)." },
          areaPath: { type: "string", description: "Area path." },
        },
        required: ["project", "name", "iteration"],
      },
    },
    {
      name: "testplan_list_test_suites",
      description: "List test suites in a test plan.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          planId: { type: "number", description: "Test plan ID." },
          continuationToken: { type: "string", description: "Continuation token." },
        },
        required: ["project", "planId"],
      },
    },
    {
      name: "testplan_create_test_suite",
      description: "Create a new test suite.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          planId: { type: "number", description: "Test plan ID." },
          parentSuiteId: { type: "number", description: "Parent suite ID." },
          name: { type: "string", description: "Suite name." },
        },
        required: ["project", "planId", "parentSuiteId", "name"],
      },
    },
    {
      name: "testplan_list_test_cases",
      description: "List test cases in a test suite.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          planId: { type: "number", description: "Test plan ID." },
          suiteId: { type: "number", description: "Test suite ID." },
        },
        required: ["project", "planId", "suiteId"],
      },
    },
    {
      name: "testplan_create_test_case",
      description: "Create a new test case.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          title: { type: "string", description: "Test case title." },
          steps: { type: "string", description: "Steps (format: '1. Step|Expected')." },
          priority: { type: "number", description: "Priority." },
          areaPath: { type: "string", description: "Area path." },
          iterationPath: { type: "string", description: "Iteration path." },
        },
        required: ["project", "title"],
      },
    },
    {
      name: "testplan_update_test_case_steps",
      description: "Update test case steps.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Test case ID." },
          steps: { type: "string", description: "Steps (format: '1. Step|Expected')." },
        },
        required: ["id", "steps"],
      },
    },
    {
      name: "testplan_add_test_cases_to_suite",
      description: "Add test cases to a test suite.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          planId: { type: "number", description: "Test plan ID." },
          suiteId: { type: "number", description: "Test suite ID." },
          testCaseIds: { type: "array", items: { type: "number" }, description: "Test case IDs." },
        },
        required: ["project", "planId", "suiteId", "testCaseIds"],
      },
    },
    {
      name: "testplan_show_test_results_from_build_id",
      description: "Get test results for a build.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project ID or name." },
          buildId: { type: "number", description: "Build ID." },
        },
        required: ["project", "buildId"],
      },
    },

    // ==================== ADVANCED SECURITY TOOLS (2) ====================
    {
      name: "advsec_get_alerts",
      description: "Get Advanced Security alerts for a repository.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          repository: { type: "string", description: "Repository name or ID." },
          alertType: { type: "string", description: "Filter by alert type." },
          states: { type: "array", items: { type: "string" }, description: "Filter by states." },
          severities: { type: "array", items: { type: "string" }, description: "Filter by severities." },
          top: { type: "number", description: "Maximum alerts." },
          onlyDefaultBranch: { type: "boolean", description: "Only default branch." },
        },
        required: ["project", "repository"],
      },
    },
    {
      name: "advsec_get_alert_details",
      description: "Get details of a specific alert.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          repository: { type: "string", description: "Repository name or ID." },
          alertId: { type: "number", description: "Alert ID." },
          ref: { type: "string", description: "Git reference." },
        },
        required: ["project", "repository", "alertId"],
      },
    },

    // ==================== WORK/ITERATIONS TOOLS (7) ====================
    {
      name: "work_list_team_iterations",
      description: "List iterations for a team.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          timeframe: { type: "string", enum: ["current"], description: "Timeframe." },
        },
        required: ["project", "team"],
      },
    },
    {
      name: "work_list_iterations",
      description: "List all iterations in a project.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          depth: { type: "number", description: "Depth of children." },
        },
        required: ["project"],
      },
    },
    {
      name: "work_create_iterations",
      description: "Create new iterations.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          iterations: { type: "array", items: { type: "object" }, description: "Iterations to create." },
        },
        required: ["project", "iterations"],
      },
    },
    {
      name: "work_assign_iterations",
      description: "Assign iterations to a team.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          iterations: { type: "array", items: { type: "object" }, description: "Iterations to assign." },
        },
        required: ["project", "team", "iterations"],
      },
    },
    {
      name: "work_get_team_capacity",
      description: "Get team capacity for an iteration.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          iterationId: { type: "string", description: "Iteration ID." },
        },
        required: ["project", "team", "iterationId"],
      },
    },
    {
      name: "work_update_team_capacity",
      description: "Update team member capacity.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          team: { type: "string", description: "Team name or ID." },
          iterationId: { type: "string", description: "Iteration ID." },
          teamMemberId: { type: "string", description: "Team member ID." },
          activities: { type: "array", items: { type: "object" }, description: "Activities." },
          daysOff: { type: "array", items: { type: "object" }, description: "Days off." },
        },
        required: ["project", "team", "iterationId", "teamMemberId", "activities"],
      },
    },
    {
      name: "work_get_iteration_capacities",
      description: "Get capacities for all teams in an iteration.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name or ID." },
          iterationId: { type: "string", description: "Iteration ID." },
        },
        required: ["project", "iterationId"],
      },
    },
  ];
}

// ==================== TOOL HANDLERS ====================
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  connection: WebApi,
  tokenProvider: () => Promise<string>,
  connectionProvider: () => Promise<WebApi>,
  userAgentProvider: () => string,
  getAuthHeader: () => string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {

  switch (name) {
    // ==================== CORE HANDLERS ====================
    case "core_list_project_teams": {
      const { project, mine, top, skip } = args as any;
      const coreApi = await connection.getCoreApi();
      const teams = await coreApi.getTeams(project, mine, top, skip, false);
      return { content: [{ type: "text", text: JSON.stringify(teams, null, 2) }] };
    }

    case "core_list_projects": {
      const { stateFilter, top, skip, projectNameFilter } = args as any;
      const coreApi = await connection.getCoreApi();
      let projects = await coreApi.getProjects(stateFilter, top, skip);
      if (projectNameFilter) {
        projects = projects.filter(p => p.name?.toLowerCase().includes(projectNameFilter.toLowerCase()));
      }
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    }

    case "core_get_identity_ids": {
      const { searchFilter } = args as any;
      const org = orgName;
      const url = `https://vssps.dev.azure.com/${org}/_apis/identities?api-version=${apiVersion}&searchFilter=General&filterValue=${encodeURIComponent(searchFilter)}`;
      const response = await fetch(url, {
        headers: { "Authorization": getAuthHeader(), "User-Agent": userAgentProvider() },
      });
      const identities = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(identities, null, 2) }] };
    }

    // ==================== REPOSITORY HANDLERS ====================
    case "repo_list_repos_by_project": {
      const { project, top = 100, skip = 0, repoNameFilter } = args as any;
      const gitApi = await connection.getGitApi();
      let repos = await gitApi.getRepositories(project);
      if (repoNameFilter) repos = repos.filter(r => r.name?.toLowerCase().includes(repoNameFilter.toLowerCase()));
      return { content: [{ type: "text", text: JSON.stringify(repos.slice(skip, skip + top), null, 2) }] };
    }

    case "repo_get_repo_by_name_or_id": {
      const { repositoryId, project } = args as any;
      const gitApi = await connection.getGitApi();
      const repo = await gitApi.getRepository(repositoryId, project);
      return { content: [{ type: "text", text: JSON.stringify(repo, null, 2) }] };
    }

    case "repo_list_branches_by_repo": {
      const { repositoryId, top = 100, filterContains } = args as any;
      const gitApi = await connection.getGitApi();
      const branches = await gitApi.getRefs(repositoryId, undefined, "heads/", undefined, undefined, undefined, undefined, undefined, filterContains);
      const result = branches.filter(b => b.name?.startsWith("refs/heads/")).map(b => b.name?.replace("refs/heads/", "")).slice(0, top);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "repo_list_my_branches_by_repo": {
      const { repositoryId, top = 100 } = args as any;
      const gitApi = await connection.getGitApi();
      const branches = await gitApi.getRefs(repositoryId, undefined, "heads/", undefined, undefined, undefined, undefined, undefined);
      // Note: API doesn't directly filter by creator, returning all branches
      const result = branches.filter(b => b.name?.startsWith("refs/heads/")).slice(0, top);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "repo_get_branch_by_name": {
      const { repositoryId, branchName } = args as any;
      const gitApi = await connection.getGitApi();
      const branch = await gitApi.getBranch(repositoryId, branchName);
      return { content: [{ type: "text", text: JSON.stringify(branch, null, 2) }] };
    }

    case "repo_create_branch": {
      const { repositoryId, branchName, sourceBranchName = "main", sourceCommitId } = args as any;
      const gitApi = await connection.getGitApi();
      let commitId = sourceCommitId;
      if (!commitId) {
        const refs = await gitApi.getRefs(repositoryId, undefined, `heads/${sourceBranchName}`);
        const ref = refs.find(r => r.name === `refs/heads/${sourceBranchName}`);
        if (!ref?.objectId) return { content: [{ type: "text", text: `Source branch '${sourceBranchName}' not found` }], isError: true };
        commitId = ref.objectId;
      }
      const result = await gitApi.updateRefs([{ name: `refs/heads/${branchName}`, newObjectId: commitId, oldObjectId: "0000000000000000000000000000000000000000" }], repositoryId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "repo_list_pull_requests_by_repo_or_project": {
      const { repositoryId, project, top = 100, skip = 0, status = "Active" } = args as any;
      const gitApi = await connection.getGitApi();
      const statusMap: Record<string, number> = { "Abandoned": 2, "Active": 1, "All": 4, "Completed": 3, "NotSet": 0 };
      const criteria = { status: statusMap[status] || 1 };
      let prs;
      if (repositoryId) prs = await gitApi.getPullRequests(repositoryId, criteria, project, undefined, skip, top);
      else if (project) prs = await gitApi.getPullRequestsByProject(project, criteria, undefined, skip, top);
      else return { content: [{ type: "text", text: "Either repositoryId or project required" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(prs, null, 2) }] };
    }

    case "repo_get_pull_request_by_id": {
      const { repositoryId, pullRequestId, includeWorkItemRefs } = args as any;
      const gitApi = await connection.getGitApi();
      const pr = await gitApi.getPullRequest(repositoryId, pullRequestId, undefined, undefined, undefined, undefined, undefined, includeWorkItemRefs);
      return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
    }

    case "repo_create_pull_request": {
      const { repositoryId, sourceRefName, targetRefName, title, description, isDraft, reviewers } = args as any;
      const gitApi = await connection.getGitApi();
      const pr = await gitApi.createPullRequest({
        sourceRefName: sourceRefName.startsWith("refs/") ? sourceRefName : `refs/heads/${sourceRefName}`,
        targetRefName: targetRefName.startsWith("refs/") ? targetRefName : `refs/heads/${targetRefName}`,
        title, description, isDraft,
        reviewers: reviewers?.map((id: string) => ({ id })),
      }, repositoryId);
      return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
    }

    case "repo_update_pull_request": {
      const { repositoryId, pullRequestId, title, description, status, targetRefName } = args as any;
      const gitApi = await connection.getGitApi();
      const statusMap: Record<string, number> = { "active": 1, "abandoned": 2, "completed": 3 };
      const update: any = {};
      if (title) update.title = title;
      if (description) update.description = description;
      if (status) update.status = statusMap[status];
      if (targetRefName) update.targetRefName = targetRefName.startsWith("refs/") ? targetRefName : `refs/heads/${targetRefName}`;
      const pr = await gitApi.updatePullRequest(update, repositoryId, pullRequestId);
      return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
    }

    case "repo_update_pull_request_reviewers": {
      const { repositoryId, pullRequestId, reviewerId, vote = 0, isRequired } = args as any;
      const gitApi = await connection.getGitApi();
      const reviewer = await gitApi.createPullRequestReviewer({ vote, isRequired }, repositoryId, pullRequestId, reviewerId);
      return { content: [{ type: "text", text: JSON.stringify(reviewer, null, 2) }] };
    }

    case "repo_list_pull_request_threads": {
      const { repositoryId, pullRequestId } = args as any;
      const gitApi = await connection.getGitApi();
      const threads = await gitApi.getThreads(repositoryId, pullRequestId);
      return { content: [{ type: "text", text: JSON.stringify(threads, null, 2) }] };
    }

    case "repo_list_pull_request_thread_comments": {
      const { repositoryId, pullRequestId, threadId } = args as any;
      const gitApi = await connection.getGitApi();
      const comments = await gitApi.getComments(repositoryId, pullRequestId, threadId);
      return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
    }

    case "repo_create_pull_request_thread": {
      const { repositoryId, pullRequestId, content, status, filePath, lineNumber } = args as any;
      const gitApi = await connection.getGitApi();
      const statusMap: Record<string, number> = { "active": 1, "fixed": 2, "wontFix": 3, "closed": 4, "pending": 6 };
      const thread: any = {
        comments: [{ content, commentType: 1 }],
        status: statusMap[status] || 1,
      };
      if (filePath) {
        thread.threadContext = { filePath, rightFileStart: { line: lineNumber || 1, offset: 1 }, rightFileEnd: { line: lineNumber || 1, offset: 1 } };
      }
      const result = await gitApi.createThread(thread, repositoryId, pullRequestId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "repo_update_pull_request_thread": {
      const { repositoryId, pullRequestId, threadId, status } = args as any;
      const gitApi = await connection.getGitApi();
      const statusMap: Record<string, number> = { "active": 1, "fixed": 2, "wontFix": 3, "closed": 4, "pending": 6 };
      const thread = await gitApi.updateThread({ status: statusMap[status] }, repositoryId, pullRequestId, threadId);
      return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
    }

    case "repo_reply_to_comment": {
      const { repositoryId, pullRequestId, threadId, content } = args as any;
      const gitApi = await connection.getGitApi();
      const comment = await gitApi.createComment({ content, commentType: 1 }, repositoryId, pullRequestId, threadId);
      return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
    }

    case "repo_search_commits": {
      const { repositoryId, project, searchText, author, fromDate, toDate, top = 100 } = args as any;
      const gitApi = await connection.getGitApi();
      const criteria: any = { $top: top };
      if (author) criteria.author = author;
      if (fromDate) criteria.fromDate = fromDate;
      if (toDate) criteria.toDate = toDate;
      const commits = await gitApi.getCommits(repositoryId, criteria, project);
      let result = commits;
      if (searchText) result = commits.filter(c => c.comment?.toLowerCase().includes(searchText.toLowerCase()));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "repo_list_pull_requests_by_commits": {
      const { repositoryId, project, commitIds } = args as any;
      const gitApi = await connection.getGitApi();
      const queries = commitIds.map((id: string) => ({ type: 1, items: [id] }));
      const result = await gitApi.getPullRequestQuery({ queries }, repositoryId, project);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // ==================== WORK ITEM HANDLERS ====================
    case "wit_get_work_item": {
      const { id, project, fields, expand } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const expandMap: Record<string, number> = { all: 4, fields: 1, links: 2, none: 0, relations: 3 };
      const workItem = await witApi.getWorkItem(id, fields, undefined, expandMap[expand], project);
      return { content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }] };
    }

    case "wit_get_work_items_batch_by_ids": {
      const { ids, project, fields, expand } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const expandMap: Record<string, number> = { all: 4, fields: 1, links: 2, none: 0, relations: 3 };
      const workItems = await witApi.getWorkItems(ids, fields, undefined, expandMap[expand], undefined, project);
      return { content: [{ type: "text", text: JSON.stringify(workItems, null, 2) }] };
    }

    case "wit_create_work_item": {
      const { project, workItemType, fields } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const document = fields.map((f: any) => ({ op: "add", path: `/fields/${f.name}`, value: encodeFormattedValue(f.value, f.format) }));
      const workItem = await witApi.createWorkItem(null, document, project, workItemType);
      return { content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }] };
    }

    case "wit_update_work_item": {
      const { id, updates } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const workItem = await witApi.updateWorkItem(null, updates, id);
      return { content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }] };
    }

    case "wit_update_work_items_batch": {
      const { project, workItems } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const results = [];
      for (const item of workItems) {
        const updated = await witApi.updateWorkItem(null, item.updates, item.id);
        results.push(updated);
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "wit_my_work_items": {
      const { project, type = "assignedtome", top = 50 } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const wiql = type === "assignedtome"
        ? `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`
        : `SELECT [System.Id] FROM WorkItems WHERE ([System.AssignedTo] = @Me OR [System.CreatedBy] = @Me) AND [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`;
      const result = await witApi.queryByWiql({ query: wiql }, project, undefined, top);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "wit_list_backlogs": {
      const { project, team } = args as any;
      const workApi = await connection.getWorkApi();
      const backlogs = await workApi.getBacklogs({ project, team });
      return { content: [{ type: "text", text: JSON.stringify(backlogs, null, 2) }] };
    }

    case "wit_list_backlog_work_items": {
      const { project, team, backlogId } = args as any;
      const workApi = await connection.getWorkApi();
      const items = await workApi.getBacklogLevelWorkItems({ project, team }, backlogId);
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    }

    case "wit_list_work_item_comments": {
      const { project, workItemId } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const comments = await witApi.getComments(project, workItemId);
      return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
    }

    case "wit_add_work_item_comment": {
      const { project, workItemId, text } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const comment = await witApi.addComment({ text }, project, workItemId);
      return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
    }

    case "wit_list_work_item_revisions": {
      const { workItemId, top, skip } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const revisions = await witApi.getRevisions(workItemId, top, skip);
      return { content: [{ type: "text", text: JSON.stringify(revisions, null, 2) }] };
    }

    case "wit_get_work_items_for_iteration": {
      const { project, team, iterationId } = args as any;
      const workApi = await connection.getWorkApi();
      const items = await workApi.getIterationWorkItems({ project, team }, iterationId);
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    }

    case "wit_add_child_work_items": {
      const { parentId, childIds } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const results = [];
      for (const childId of childIds) {
        const doc = [{ op: "add", path: "/relations/-", value: { rel: "System.LinkTypes.Hierarchy-Forward", url: `${connection.serverUrl}/_apis/wit/workItems/${childId}` } }];
        const updated = await witApi.updateWorkItem(null, doc, parentId);
        results.push(updated);
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "wit_work_items_link": {
      const { sourceId, targetId, linkType, comment } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const linkTypeMap: Record<string, string> = {
        parent: "System.LinkTypes.Hierarchy-Reverse", child: "System.LinkTypes.Hierarchy-Forward",
        related: "System.LinkTypes.Related", duplicate: "System.LinkTypes.Duplicate-Forward",
      };
      const rel = linkTypeMap[linkType] || linkType;
      const doc = [{ op: "add", path: "/relations/-", value: { rel, url: `${connection.serverUrl}/_apis/wit/workItems/${targetId}`, attributes: comment ? { comment } : undefined } }];
      const updated = await witApi.updateWorkItem(null, doc, sourceId);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    case "wit_work_item_unlink": {
      const { sourceId, targetId, linkType } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const workItem = await witApi.getWorkItem(sourceId, undefined, undefined, 3); // relations
      const relations = workItem.relations || [];
      const idx = relations.findIndex((r: any) => r.url?.endsWith(`/${targetId}`) && r.rel?.includes(linkType));
      if (idx === -1) return { content: [{ type: "text", text: "Link not found" }], isError: true };
      const doc = [{ op: "remove", path: `/relations/${idx}` }];
      const updated = await witApi.updateWorkItem(null, doc, sourceId);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    case "wit_link_work_item_to_pull_request": {
      const { workItemId, repositoryId, pullRequestId } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const artifactUri = `vstfs:///Git/PullRequestId/${repositoryId}/${pullRequestId}`;
      const doc = [{ op: "add", path: "/relations/-", value: { rel: "ArtifactLink", url: artifactUri, attributes: { name: "Pull Request" } } }];
      const updated = await witApi.updateWorkItem(null, doc, workItemId);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    case "wit_add_artifact_link": {
      const { workItemId, artifactUri, linkType = "ArtifactLink", comment } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const doc = [{ op: "add", path: "/relations/-", value: { rel: linkType, url: artifactUri, attributes: comment ? { comment } : undefined } }];
      const updated = await witApi.updateWorkItem(null, doc, workItemId);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    case "wit_get_work_item_type": {
      const { project, type } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const witType = await witApi.getWorkItemType(project, type);
      return { content: [{ type: "text", text: JSON.stringify(witType, null, 2) }] };
    }

    case "wit_get_query": {
      const { project, queryPath, expand } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const expandMap: Record<string, number> = { all: 2, clauses: 1, minimal: 0, none: 0, wiql: 1 };
      const query = await witApi.getQuery(project, queryPath, expandMap[expand], 1);
      return { content: [{ type: "text", text: JSON.stringify(query, null, 2) }] };
    }

    case "wit_get_query_results_by_id": {
      const { project, queryId, team } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const result = await witApi.queryById(queryId, { project, team });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    // ==================== PIPELINE HANDLERS ====================
    case "pipelines_get_builds": {
      const { project, definitions, top, branchName, buildNumber, statusFilter, resultFilter } = args as any;
      const buildApi = await connection.getBuildApi();
      const builds = await buildApi.getBuilds(project, definitions, undefined, buildNumber, undefined, undefined, undefined, undefined, statusFilter, resultFilter, undefined, undefined, top, undefined, undefined, undefined, undefined, branchName);
      return { content: [{ type: "text", text: JSON.stringify(builds, null, 2) }] };
    }

    case "pipelines_get_build_changes": {
      const { project, buildId, top = 100 } = args as any;
      const buildApi = await connection.getBuildApi();
      const changes = await buildApi.getBuildChanges(project, buildId, undefined, top);
      return { content: [{ type: "text", text: JSON.stringify(changes, null, 2) }] };
    }

    case "pipelines_get_build_definitions": {
      const { project, name, repositoryId, repositoryType, top, path } = args as any;
      const buildApi = await connection.getBuildApi();
      const defs = await buildApi.getDefinitions(project, name, repositoryId, repositoryType, undefined, top, undefined, undefined, undefined, path);
      return { content: [{ type: "text", text: JSON.stringify(defs, null, 2) }] };
    }

    case "pipelines_get_build_definition_revisions": {
      const { project, definitionId } = args as any;
      const buildApi = await connection.getBuildApi();
      const revisions = await buildApi.getDefinitionRevisions(project, definitionId);
      return { content: [{ type: "text", text: JSON.stringify(revisions, null, 2) }] };
    }

    case "pipelines_get_build_log": {
      const { project, buildId } = args as any;
      const buildApi = await connection.getBuildApi();
      const logs = await buildApi.getBuildLogs(project, buildId);
      return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
    }

    case "pipelines_get_build_log_by_id": {
      const { project, buildId, logId, startLine, endLine } = args as any;
      const buildApi = await connection.getBuildApi();
      const logLines = await buildApi.getBuildLogLines(project, buildId, logId, startLine, endLine);
      return { content: [{ type: "text", text: JSON.stringify(logLines, null, 2) }] };
    }

    case "pipelines_get_build_status": {
      const { project, buildId } = args as any;
      const buildApi = await connection.getBuildApi();
      const report = await buildApi.getBuildReport(project, buildId);
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    }

    case "pipelines_update_build_stage": {
      const { project, buildId, stageName, status, forceRetryAllJobs } = args as any;
      const url = `${connection.serverUrl}/${project}/_apis/build/builds/${buildId}/stages/${stageName}?api-version=${apiVersion}`;
      const stageUpdateMap: Record<string, number> = { "Retry": 1, "Cancel": 2 };
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Authorization": getAuthHeader(), "Content-Type": "application/json", "User-Agent": userAgentProvider() },
        body: JSON.stringify({ state: stageUpdateMap[status] || 1, forceRetryAllJobs }),
      });
      const result = await response.text();
      return { content: [{ type: "text", text: result }] };
    }

    case "pipelines_create_pipeline": {
      const { project, name, folder, yamlPath, repositoryType, repositoryName, repositoryId } = args as any;
      const pipelinesApi = await connection.getPipelinesApi();
      const repoTypeMap: Record<string, number> = { "azureReposGit": 0, "gitHub": 1 };
      const config: any = {
        name, folder: folder || "\\",
        configuration: { type: "yaml", path: yamlPath, repository: { type: repositoryType, name: repositoryName, id: repositoryId } },
      };
      const pipeline = await pipelinesApi.createPipeline(config, project);
      return { content: [{ type: "text", text: JSON.stringify(pipeline, null, 2) }] };
    }

    case "pipelines_get_run": {
      const { project, pipelineId, runId } = args as any;
      const pipelinesApi = await connection.getPipelinesApi();
      const run = await pipelinesApi.getRun(project, pipelineId, runId);
      return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
    }

    case "pipelines_list_runs": {
      const { project, pipelineId } = args as any;
      const pipelinesApi = await connection.getPipelinesApi();
      const runs = await pipelinesApi.listRuns(project, pipelineId);
      return { content: [{ type: "text", text: JSON.stringify(runs, null, 2) }] };
    }

    case "pipelines_run_pipeline": {
      const { project, pipelineId, templateParameters, stagesToSkip, variables } = args as any;
      const pipelinesApi = await connection.getPipelinesApi();
      const run = await pipelinesApi.runPipeline({ templateParameters, stagesToSkip, variables }, project, pipelineId);
      return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
    }

    case "pipelines_list_artifacts": {
      const { project, buildId } = args as any;
      const buildApi = await connection.getBuildApi();
      const artifacts = await buildApi.getArtifacts(project, buildId);
      return { content: [{ type: "text", text: JSON.stringify(artifacts, null, 2) }] };
    }

    case "pipelines_download_artifact": {
      const { project, buildId, artifactName, destinationPath } = args as any;
      const buildApi = await connection.getBuildApi();
      const stream = await buildApi.getArtifactContentZip(project, buildId, artifactName);
      if (destinationPath) {
        mkdirSync(resolve(destinationPath), { recursive: true });
        const filePath = join(resolve(destinationPath), `${artifactName}.zip`);
        const writeStream = createWriteStream(filePath);
        await new Promise<void>((res, rej) => { stream.pipe(writeStream); stream.on("end", res); stream.on("error", rej); });
        return { content: [{ type: "text", text: `Artifact saved to ${filePath}` }] };
      }
      const chunks: Buffer[] = [];
      await new Promise<void>((res, rej) => { stream.on("data", c => chunks.push(Buffer.from(c))); stream.on("end", res); stream.on("error", rej); });
      return { content: [{ type: "text", text: `Artifact size: ${Buffer.concat(chunks).length} bytes (base64 not shown)` }] };
    }

    // ==================== WIKI HANDLERS ====================
    case "wiki_list_wikis": {
      const { project } = args as any;
      const wikiApi = await connection.getWikiApi();
      const wikis = await wikiApi.getAllWikis(project);
      return { content: [{ type: "text", text: JSON.stringify(wikis, null, 2) }] };
    }

    case "wiki_get_wiki": {
      const { wikiIdentifier, project } = args as any;
      const wikiApi = await connection.getWikiApi();
      const wiki = await wikiApi.getWiki(wikiIdentifier, project);
      return { content: [{ type: "text", text: JSON.stringify(wiki, null, 2) }] };
    }

    case "wiki_list_pages": {
      const { wikiIdentifier, project, top = 20, continuationToken } = args as any;
      const wikiApi = await connection.getWikiApi();
      const batch: WikiPagesBatchRequest = { top, continuationToken };
      const pages = await wikiApi.getPagesBatch(batch, project, wikiIdentifier);
      return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
    }

    case "wiki_get_page": {
      const { wikiIdentifier, project, path, recursionLevel } = args as any;
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${connection.serverUrl}/${project}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${encodeURIComponent(normalizedPath)}&recursionLevel=${recursionLevel || "None"}&api-version=7.1`;
      const response = await fetch(url, { headers: { "Authorization": getAuthHeader(), "User-Agent": userAgentProvider() } });
      const page = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
    }

    case "wiki_get_page_content": {
      const { wikiIdentifier, project, path = "/" } = args as any;
      const wikiApi = await connection.getWikiApi();
      const stream = await wikiApi.getPageText(project, wikiIdentifier, path, undefined, undefined, true);
      if (!stream) return { content: [{ type: "text", text: "No content found" }], isError: true };
      const content = await streamToString(stream);
      return { content: [{ type: "text", text: content }] };
    }

    case "wiki_create_or_update_page": {
      const { wikiIdentifier, project, path, content, etag } = args as any;
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${connection.serverUrl}/${project || ""}/_apis/wiki/wikis/${wikiIdentifier}/pages?path=${encodeURIComponent(normalizedPath)}&api-version=7.1`;
      const headers: Record<string, string> = { "Authorization": getAuthHeader(), "Content-Type": "application/json", "User-Agent": userAgentProvider() };
      if (etag) headers["If-Match"] = etag;
      const response = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ content }) });
      if (response.ok) return { content: [{ type: "text", text: JSON.stringify(await response.json(), null, 2) }] };
      // Try update with ETag
      const getResp = await fetch(url, { headers: { "Authorization": getAuthHeader(), "User-Agent": userAgentProvider() } });
      if (getResp.ok) {
        const currentEtag = getResp.headers.get("etag");
        if (currentEtag) {
          const updateResp = await fetch(url, { method: "PUT", headers: { ...headers, "If-Match": currentEtag }, body: JSON.stringify({ content }) });
          if (updateResp.ok) return { content: [{ type: "text", text: JSON.stringify(await updateResp.json(), null, 2) }] };
        }
      }
      return { content: [{ type: "text", text: await response.text() }], isError: true };
    }

    // ==================== SEARCH HANDLERS ====================
    case "search_code": {
      const { searchText, project, repository, path, branch, top = 10, skip = 0 } = args as any;
      const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/codesearchresults?api-version=${apiVersion}`;
      const body: any = { searchText, $skip: skip, $top: top };
      const filters: any = {};
      if (project?.length) filters.Project = project;
      if (repository?.length) filters.Repository = repository;
      if (path?.length) filters.Path = path;
      if (branch?.length) filters.Branch = branch;
      if (Object.keys(filters).length) body.filters = filters;
      const response = await fetch(url, { method: "POST", headers: { "Authorization": getAuthHeader(), "Content-Type": "application/json", "User-Agent": userAgentProvider() }, body: JSON.stringify(body) });
      return { content: [{ type: "text", text: await response.text() }] };
    }

    case "search_wiki": {
      const { searchText, project, wiki, top = 10, skip = 0 } = args as any;
      const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/wikisearchresults?api-version=${apiVersion}`;
      const body: any = { searchText, $skip: skip, $top: top };
      const filters: any = {};
      if (project?.length) filters.Project = project;
      if (wiki?.length) filters.Wiki = wiki;
      if (Object.keys(filters).length) body.filters = filters;
      const response = await fetch(url, { method: "POST", headers: { "Authorization": getAuthHeader(), "Content-Type": "application/json", "User-Agent": userAgentProvider() }, body: JSON.stringify(body) });
      return { content: [{ type: "text", text: await response.text() }] };
    }

    case "search_workitem": {
      const { searchText, project, workItemType, state, assignedTo, top = 10, skip = 0 } = args as any;
      const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/workitemsearchresults?api-version=${apiVersion}`;
      const body: any = { searchText, $skip: skip, $top: top };
      const filters: any = {};
      if (project?.length) filters["System.TeamProject"] = project;
      if (workItemType?.length) filters["System.WorkItemType"] = workItemType;
      if (state?.length) filters["System.State"] = state;
      if (assignedTo?.length) filters["System.AssignedTo"] = assignedTo;
      if (Object.keys(filters).length) body.filters = filters;
      const response = await fetch(url, { method: "POST", headers: { "Authorization": getAuthHeader(), "Content-Type": "application/json", "User-Agent": userAgentProvider() }, body: JSON.stringify(body) });
      return { content: [{ type: "text", text: await response.text() }] };
    }

    // ==================== TEST PLAN HANDLERS ====================
    case "testplan_list_test_plans": {
      const { project, filterActivePlans = true, includePlanDetails = false, continuationToken } = args as any;
      const testPlanApi = await connection.getTestPlanApi();
      const plans = await testPlanApi.getTestPlans(project, "", continuationToken, includePlanDetails, filterActivePlans);
      return { content: [{ type: "text", text: JSON.stringify(plans, null, 2) }] };
    }

    case "testplan_create_test_plan": {
      const { project, name, iteration, description, startDate, endDate, areaPath } = args as any;
      const testPlanApi = await connection.getTestPlanApi();
      const plan = await testPlanApi.createTestPlan({ name, iteration, description, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, areaPath }, project);
      return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
    }

    case "testplan_list_test_suites": {
      const { project, planId, continuationToken } = args as any;
      const testPlanApi = await connection.getTestPlanApi();
      const suites = await testPlanApi.getTestSuitesForPlan(project, planId, SuiteExpand.Children, continuationToken);
      return { content: [{ type: "text", text: JSON.stringify(suites, null, 2) }] };
    }

    case "testplan_create_test_suite": {
      const { project, planId, parentSuiteId, name } = args as any;
      const testPlanApi = await connection.getTestPlanApi();
      const suite = await testPlanApi.createTestSuite({ name, parentSuite: { id: parentSuiteId, name: "" }, suiteType: 2 }, project, planId);
      return { content: [{ type: "text", text: JSON.stringify(suite, null, 2) }] };
    }

    case "testplan_list_test_cases": {
      const { project, planId, suiteId } = args as any;
      const testPlanApi = await connection.getTestPlanApi();
      const cases = await testPlanApi.getTestCaseList(project, planId, suiteId);
      return { content: [{ type: "text", text: JSON.stringify(cases, null, 2) }] };
    }

    case "testplan_create_test_case": {
      const { project, title, steps, priority, areaPath, iterationPath } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const doc: any[] = [{ op: "add", path: "/fields/System.Title", value: title }];
      if (steps) doc.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: convertStepsToXml(steps) });
      if (priority) doc.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: priority });
      if (areaPath) doc.push({ op: "add", path: "/fields/System.AreaPath", value: areaPath });
      if (iterationPath) doc.push({ op: "add", path: "/fields/System.IterationPath", value: iterationPath });
      const testCase = await witApi.createWorkItem({}, doc, project, "Test Case");
      return { content: [{ type: "text", text: JSON.stringify(testCase, null, 2) }] };
    }

    case "testplan_update_test_case_steps": {
      const { id, steps } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const doc = [{ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: convertStepsToXml(steps) }];
      const testCase = await witApi.updateWorkItem({}, doc, id);
      return { content: [{ type: "text", text: JSON.stringify(testCase, null, 2) }] };
    }

    case "testplan_add_test_cases_to_suite": {
      const { project, planId, suiteId, testCaseIds } = args as any;
      const testApi = await connection.getTestApi();
      const idsString = testCaseIds.join(",");
      const result = await testApi.addTestCasesToSuite(project, planId, suiteId, idsString);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "testplan_show_test_results_from_build_id": {
      const { project, buildId } = args as any;
      const testResultsApi = await connection.getTestResultsApi();
      const results = await testResultsApi.getTestResultDetailsForBuild(project, buildId);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    // ==================== ADVANCED SECURITY HANDLERS ====================
    case "advsec_get_alerts": {
      const { project, repository, alertType, states, severities, top = 100, onlyDefaultBranch = true } = args as any;
      const alertApi = await connection.getAlertApi();
      const criteria: any = { onlyDefaultBranch };
      if (alertType) criteria.alertType = mapStringToEnum(alertType, AlertType);
      if (states) criteria.states = mapStringArrayToEnum(states, State);
      if (severities) criteria.severities = mapStringArrayToEnum(severities, Severity);
      const alerts = await alertApi.getAlerts(project, repository, top, "severity", criteria);
      return { content: [{ type: "text", text: JSON.stringify(alerts, null, 2) }] };
    }

    case "advsec_get_alert_details": {
      const { project, repository, alertId, ref } = args as any;
      const alertApi = await connection.getAlertApi();
      const alert = await alertApi.getAlert(project, alertId, repository, ref);
      return { content: [{ type: "text", text: JSON.stringify(alert, null, 2) }] };
    }

    // ==================== WORK/ITERATIONS HANDLERS ====================
    case "work_list_team_iterations": {
      const { project, team, timeframe } = args as any;
      const workApi = await connection.getWorkApi();
      const iterations = await workApi.getTeamIterations({ project, team }, timeframe);
      return { content: [{ type: "text", text: JSON.stringify(iterations, null, 2) }] };
    }

    case "work_list_iterations": {
      const { project, depth = 2 } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const nodes = await witApi.getClassificationNodes(project, [], depth);
      const iterations = nodes?.filter(n => n.structureType === TreeNodeStructureType.Iteration);
      return { content: [{ type: "text", text: JSON.stringify(iterations, null, 2) }] };
    }

    case "work_create_iterations": {
      const { project, iterations } = args as any;
      const witApi = await connection.getWorkItemTrackingApi();
      const results = [];
      for (const { iterationName, startDate, finishDate } of iterations) {
        const iter = await witApi.createOrUpdateClassificationNode({
          name: iterationName,
          attributes: { startDate: startDate ? new Date(startDate) : undefined, finishDate: finishDate ? new Date(finishDate) : undefined },
        }, project, TreeStructureGroup.Iterations);
        results.push(iter);
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "work_assign_iterations": {
      const { project, team, iterations } = args as any;
      const workApi = await connection.getWorkApi();
      const results = [];
      for (const { identifier, path } of iterations) {
        const assigned = await workApi.postTeamIteration({ id: identifier, path }, { project, team });
        results.push(assigned);
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "work_get_team_capacity": {
      const { project, team, iterationId } = args as any;
      const workApi = await connection.getWorkApi();
      const capacity = await workApi.getCapacitiesWithIdentityRefAndTotals({ project, team }, iterationId);
      return { content: [{ type: "text", text: JSON.stringify(capacity, null, 2) }] };
    }

    case "work_update_team_capacity": {
      const { project, team, iterationId, teamMemberId, activities, daysOff } = args as any;
      const workApi = await connection.getWorkApi();
      const patch = {
        activities: activities.map((a: any) => ({ name: a.name, capacityPerDay: a.capacityPerDay })),
        daysOff: daysOff?.map((d: any) => ({ start: new Date(d.start), end: new Date(d.end) })),
      };
      const updated = await workApi.updateCapacityWithIdentityRef(patch, { project, team }, iterationId, teamMemberId);
      return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
    }

    case "work_get_iteration_capacities": {
      const { project, iterationId } = args as any;
      const workApi = await connection.getWorkApi();
      const capacities = await workApi.getTotalIterationCapacities(project, iterationId);
      return { content: [{ type: "text", text: JSON.stringify(capacities, null, 2) }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}

// ==================== HELPER FUNCTIONS ====================
function convertStepsToXml(steps: string): string {
  const lines = steps.split("\n").filter(l => l.trim());
  let xml = `<steps id="0" last="${lines.length}">`;
  for (let i = 0; i < lines.length; i++) {
    const [stepPart, expectedPart] = lines[i].split("|").map(s => s.trim());
    const stepMatch = stepPart.match(/^(\d+)\.\s*(.+)$/);
    const stepText = stepMatch ? stepMatch[2] : stepPart;
    const expectedText = expectedPart || "Verify step completes successfully";
    xml += `<step id="${i + 1}" type="ActionStep"><parameterizedString isformatted="true">${escapeXml(stepText)}</parameterizedString><parameterizedString isformatted="true">${escapeXml(expectedText)}</parameterizedString></step>`;
  }
  return xml + "</steps>";
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] || c);
}

export async function runServer(config: ServerConfig) {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
