# MCP Azure DevOps Server

Um servidor MCP (Model Context Protocol) para Azure DevOps que combina os recursos abrangentes do MCP oficial da Microsoft com autenticação simplificada usando apenas PAT (Personal Access Token).

## Características

- **Autenticação simples via PAT**: Não requer autenticação interativa via navegador
- **100% dos recursos do MCP oficial**: Inclui todos os 82 tools do Azure DevOps MCP da Microsoft
- **Compatível com Claude Code e outros clientes MCP**

## Recursos Disponíveis (82 tools)

### Core (3 tools)
| Tool | Descrição |
|------|-----------|
| `core_list_projects` | Listar projetos da organização |
| `core_list_project_teams` | Listar times de um projeto |
| `core_get_identity_ids` | Buscar identidades por filtro |

### Repositórios (18 tools)
| Tool | Descrição |
|------|-----------|
| `repo_list_repos_by_project` | Listar repositórios de um projeto |
| `repo_get_repo_by_name_or_id` | Obter repositório por nome ou ID |
| `repo_list_branches_by_repo` | Listar branches de um repositório |
| `repo_list_my_branches_by_repo` | Listar minhas branches |
| `repo_get_branch_by_name` | Obter branch por nome |
| `repo_create_branch` | Criar nova branch |
| `repo_list_pull_requests_by_repo_or_project` | Listar pull requests |
| `repo_get_pull_request_by_id` | Obter detalhes de um PR |
| `repo_create_pull_request` | Criar pull request |
| `repo_update_pull_request` | Atualizar pull request |
| `repo_update_pull_request_reviewers` | Atualizar revisores do PR |
| `repo_list_pull_request_threads` | Listar threads de comentários do PR |
| `repo_list_pull_request_thread_comments` | Listar comentários de uma thread |
| `repo_create_pull_request_thread` | Criar thread de comentário |
| `repo_update_pull_request_thread` | Atualizar thread |
| `repo_reply_to_comment` | Responder a um comentário |
| `repo_search_commits` | Buscar commits |
| `repo_list_pull_requests_by_commits` | Listar PRs por commits |

### Work Items (21 tools)
| Tool | Descrição |
|------|-----------|
| `wit_get_work_item` | Obter work item por ID |
| `wit_get_work_items_batch_by_ids` | Obter múltiplos work items |
| `wit_create_work_item` | Criar work item |
| `wit_update_work_item` | Atualizar work item |
| `wit_update_work_items_batch` | Atualizar múltiplos work items |
| `wit_my_work_items` | Listar meus work items |
| `wit_list_backlogs` | Listar backlogs |
| `wit_list_backlog_work_items` | Listar items do backlog |
| `wit_list_work_item_comments` | Listar comentários |
| `wit_add_work_item_comment` | Adicionar comentário |
| `wit_list_work_item_revisions` | Listar revisões |
| `wit_get_work_items_for_iteration` | Obter items de uma iteração |
| `wit_add_child_work_items` | Adicionar work items filhos |
| `wit_work_items_link` | Criar link entre work items |
| `wit_work_item_unlink` | Remover link entre work items |
| `wit_link_work_item_to_pull_request` | Vincular work item a PR |
| `wit_add_artifact_link` | Adicionar link de artefato |
| `wit_get_work_item_type` | Obter tipo de work item |
| `wit_get_query` | Obter query salva |
| `wit_get_query_results_by_id` | Executar query por ID |

### Pipelines (14 tools)
| Tool | Descrição |
|------|-----------|
| `pipelines_get_builds` | Listar builds |
| `pipelines_get_build_changes` | Obter mudanças de um build |
| `pipelines_get_build_definitions` | Listar definições de build |
| `pipelines_get_build_definition_revisions` | Listar revisões de definição |
| `pipelines_get_build_log` | Obter logs de build |
| `pipelines_get_build_log_by_id` | Obter log específico por ID |
| `pipelines_get_build_status` | Obter status do build |
| `pipelines_update_build_stage` | Atualizar estágio do build |
| `pipelines_create_pipeline` | Criar pipeline |
| `pipelines_get_run` | Obter execução de pipeline |
| `pipelines_list_runs` | Listar execuções |
| `pipelines_run_pipeline` | Executar pipeline |
| `pipelines_list_artifacts` | Listar artefatos |
| `pipelines_download_artifact` | Baixar artefato |

### Wiki (6 tools)
| Tool | Descrição |
|------|-----------|
| `wiki_list_wikis` | Listar wikis do projeto |
| `wiki_get_wiki` | Obter wiki por ID |
| `wiki_list_pages` | Listar páginas da wiki |
| `wiki_get_page` | Obter página por path |
| `wiki_get_page_content` | Obter conteúdo da página |
| `wiki_create_or_update_page` | Criar ou atualizar página |

### Search (3 tools)
| Tool | Descrição |
|------|-----------|
| `search_code` | Buscar código |
| `search_wiki` | Buscar na wiki |
| `search_workitem` | Buscar work items |

### Test Plans (9 tools)
| Tool | Descrição |
|------|-----------|
| `testplan_list_test_plans` | Listar test plans |
| `testplan_create_test_plan` | Criar test plan |
| `testplan_list_test_suites` | Listar test suites |
| `testplan_create_test_suite` | Criar test suite |
| `testplan_list_test_cases` | Listar test cases |
| `testplan_create_test_case` | Criar test case |
| `testplan_update_test_case_steps` | Atualizar passos do test case |
| `testplan_add_test_cases_to_suite` | Adicionar test cases a suite |
| `testplan_show_test_results_from_build_id` | Obter resultados de teste de um build |

### Advanced Security (2 tools)
| Tool | Descrição |
|------|-----------|
| `advsec_get_alerts` | Obter alertas de segurança |
| `advsec_get_alert_details` | Obter detalhes de um alerta |

### Work/Iterations (7 tools)
| Tool | Descrição |
|------|-----------|
| `work_list_team_iterations` | Listar iterações do time |
| `work_list_iterations` | Listar iterações do projeto |
| `work_create_iterations` | Criar iterações |
| `work_assign_iterations` | Atribuir iterações ao time |
| `work_get_team_capacity` | Obter capacidade do time |
| `work_update_team_capacity` | Atualizar capacidade |
| `work_get_iteration_capacities` | Obter capacidades da iteração |

## Instalação

```bash
npm install
npm run build
```

## Configuração

Defina as variáveis de ambiente:

```bash
# URL da organização Azure DevOps
export AZURE_DEVOPS_ORG_URL=https://dev.azure.com/sua-organizacao

# Personal Access Token
export AZURE_DEVOPS_PAT=seu-pat-token
```

### Gerando um PAT

1. Acesse `https://dev.azure.com/{sua-org}/_usersSettings/tokens`
2. Clique em "New Token"
3. Selecione os escopos necessários:
   - **Code**: Read & Write
   - **Work Items**: Read & Write
   - **Build**: Read & Execute
   - **Project and Team**: Read
   - **Wiki**: Read & Write
   - **Test Management**: Read & Write
   - **Advanced Security**: Read (se necessário)

## Uso com Claude Code

Adicione ao seu arquivo de configuração MCP (`~/.config/claude-code/mcp.json` ou similar):

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": ["/caminho/para/mcp-azure-devops/dist/index.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/sua-organizacao",
        "AZURE_DEVOPS_PAT": "seu-pat-token"
      }
    }
  }
}
```

## Execução Manual

```bash
# Com variáveis de ambiente
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/org AZURE_DEVOPS_PAT=token npm start

# Ou usando arquivo .env
npm start
```

## Comparação com o MCP oficial da Microsoft

| Característica | MCP Microsoft | Este MCP |
|---------------|---------------|----------|
| Autenticação | OAuth interativo, Azure CLI, env vars | Apenas PAT |
| Requer navegador | Sim (padrão) | Não |
| Total de tools | 82 | 82 (100%) |
| Complexidade | Alta | Baixa |

## Licença

MIT
