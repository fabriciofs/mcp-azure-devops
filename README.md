# MCP Azure DevOps Server

An MCP (Model Context Protocol) server for Azure DevOps that combines the comprehensive features of Microsoft's official MCP with simplified authentication using only PAT (Personal Access Token).

## Features

- **Simple PAT authentication**: No interactive browser authentication required
- **100% of official MCP features**: Includes all 82 tools from Microsoft's Azure DevOps MCP
- **Compatible with Claude Code and other MCP clients**

## Available Resources (82 tools)

### Core (3 tools)
| Tool | Description |
|------|-------------|
| `core_list_projects` | List organization projects |
| `core_list_project_teams` | List teams in a project |
| `core_get_identity_ids` | Search identities by filter |

### Repositories (18 tools)
| Tool | Description |
|------|-------------|
| `repo_list_repos_by_project` | List repositories in a project |
| `repo_get_repo_by_name_or_id` | Get repository by name or ID |
| `repo_list_branches_by_repo` | List branches in a repository |
| `repo_list_my_branches_by_repo` | List my branches |
| `repo_get_branch_by_name` | Get branch by name |
| `repo_create_branch` | Create new branch |
| `repo_list_pull_requests_by_repo_or_project` | List pull requests |
| `repo_get_pull_request_by_id` | Get PR details |
| `repo_create_pull_request` | Create pull request |
| `repo_update_pull_request` | Update pull request |
| `repo_update_pull_request_reviewers` | Update PR reviewers |
| `repo_list_pull_request_threads` | List PR comment threads |
| `repo_list_pull_request_thread_comments` | List comments in a thread |
| `repo_create_pull_request_thread` | Create comment thread |
| `repo_update_pull_request_thread` | Update thread |
| `repo_reply_to_comment` | Reply to a comment |
| `repo_search_commits` | Search commits |
| `repo_list_pull_requests_by_commits` | List PRs by commits |

### Work Items (21 tools)
| Tool | Description |
|------|-------------|
| `wit_get_work_item` | Get work item by ID |
| `wit_get_work_items_batch_by_ids` | Get multiple work items |
| `wit_create_work_item` | Create work item |
| `wit_update_work_item` | Update work item |
| `wit_update_work_items_batch` | Update multiple work items |
| `wit_my_work_items` | List my work items |
| `wit_list_backlogs` | List backlogs |
| `wit_list_backlog_work_items` | List backlog items |
| `wit_list_work_item_comments` | List comments |
| `wit_add_work_item_comment` | Add comment |
| `wit_list_work_item_revisions` | List revisions |
| `wit_get_work_items_for_iteration` | Get items for an iteration |
| `wit_add_child_work_items` | Add child work items |
| `wit_work_items_link` | Create link between work items |
| `wit_work_item_unlink` | Remove link between work items |
| `wit_link_work_item_to_pull_request` | Link work item to PR |
| `wit_add_artifact_link` | Add artifact link |
| `wit_get_work_item_type` | Get work item type |
| `wit_get_query` | Get saved query |
| `wit_get_query_results_by_id` | Execute query by ID |

### Pipelines (14 tools)
| Tool | Description |
|------|-------------|
| `pipelines_get_builds` | List builds |
| `pipelines_get_build_changes` | Get build changes |
| `pipelines_get_build_definitions` | List build definitions |
| `pipelines_get_build_definition_revisions` | List definition revisions |
| `pipelines_get_build_log` | Get build logs |
| `pipelines_get_build_log_by_id` | Get specific log by ID |
| `pipelines_get_build_status` | Get build status |
| `pipelines_update_build_stage` | Update build stage |
| `pipelines_create_pipeline` | Create pipeline |
| `pipelines_get_run` | Get pipeline run |
| `pipelines_list_runs` | List runs |
| `pipelines_run_pipeline` | Run pipeline |
| `pipelines_list_artifacts` | List artifacts |
| `pipelines_download_artifact` | Download artifact |

### Wiki (6 tools)
| Tool | Description |
|------|-------------|
| `wiki_list_wikis` | List project wikis |
| `wiki_get_wiki` | Get wiki by ID |
| `wiki_list_pages` | List wiki pages |
| `wiki_get_page` | Get page by path |
| `wiki_get_page_content` | Get page content |
| `wiki_create_or_update_page` | Create or update page |

### Search (3 tools)
| Tool | Description |
|------|-------------|
| `search_code` | Search code |
| `search_wiki` | Search wiki |
| `search_workitem` | Search work items |

### Test Plans (9 tools)
| Tool | Description |
|------|-------------|
| `testplan_list_test_plans` | List test plans |
| `testplan_create_test_plan` | Create test plan |
| `testplan_list_test_suites` | List test suites |
| `testplan_create_test_suite` | Create test suite |
| `testplan_list_test_cases` | List test cases |
| `testplan_create_test_case` | Create test case |
| `testplan_update_test_case_steps` | Update test case steps |
| `testplan_add_test_cases_to_suite` | Add test cases to suite |
| `testplan_show_test_results_from_build_id` | Get test results from a build |

### Advanced Security (2 tools)
| Tool | Description |
|------|-------------|
| `advsec_get_alerts` | Get security alerts |
| `advsec_get_alert_details` | Get alert details |

### Work/Iterations (7 tools)
| Tool | Description |
|------|-------------|
| `work_list_team_iterations` | List team iterations |
| `work_list_iterations` | List project iterations |
| `work_create_iterations` | Create iterations |
| `work_assign_iterations` | Assign iterations to team |
| `work_get_team_capacity` | Get team capacity |
| `work_update_team_capacity` | Update capacity |
| `work_get_iteration_capacities` | Get iteration capacities |

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the environment variables:

```bash
# Azure DevOps organization URL
export AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization

# Personal Access Token
export AZURE_DEVOPS_PAT=your-pat-token
```

### Generating a PAT

1. Go to `https://dev.azure.com/{your-org}/_usersSettings/tokens`
2. Click "New Token"
3. Select the required scopes:
   - **Code**: Read & Write
   - **Work Items**: Read & Write
   - **Build**: Read & Execute
   - **Project and Team**: Read
   - **Wiki**: Read & Write
   - **Test Management**: Read & Write
   - **Advanced Security**: Read (if needed)

## Usage with Claude Code

Add to your MCP configuration file (`~/.config/claude-code/mcp.json` or similar):

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": ["/path/to/mcp-azure-devops/build/index.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_PAT": "your-pat-token"
      }
    }
  }
}
```

## Manual Execution

```bash
# With environment variables
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/org AZURE_DEVOPS_PAT=token npm start

# Or using .env file
npm start
```

## Comparison with Microsoft's official MCP

| Feature | Microsoft MCP | This MCP |
|---------|---------------|----------|
| Authentication | Interactive OAuth, Azure CLI, env vars | PAT only |
| Requires browser | Yes (default) | No |
| Total tools | 82 | 82 (100%) |
| Complexity | High | Low |

## License

MIT
