#!/bin/sh
# Publish this reviewed Git repository to the authenticated user's private GitHub repo.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
command -v gh >/dev/null 2>&1 || { printf '%s\n' '请先安装GitHub CLI。'; exit 1; }
gh auth status >/dev/null 2>&1 || { printf '%s\n' '请先运行 gh auth login --hostname github.com --web 完成登录，然后重试。'; exit 1; }
[ -z "$(git status --porcelain)" ] || { printf '%s\n' '存在未提交改动，请先检查并提交。'; exit 1; }
github_owner=$(gh api user --jq .login)
repository_name=${1:-obsidian-workbench}
case "$repository_name" in ''|*[!A-Za-z0-9._-]*) printf '%s\n' '仓库名称只能包含字母、数字、点、下划线和短横线。'; exit 1;; esac
repository_target="$github_owner/$repository_name"
expected_url="https://github.com/$repository_target.git"
if git remote get-url origin >/dev/null 2>&1; then
    existing_url=$(git remote get-url origin)
    [ "$existing_url" = "$expected_url" ] || { printf '%s\n' 'origin与目标仓库不同，停止以免上传到错误位置。'; exit 1; }
fi
if gh repo view "$repository_target" --json nameWithOwner >/dev/null 2>&1; then
    git remote get-url origin >/dev/null 2>&1 || git remote add origin "$expected_url"
    git push -u origin main
else
    if git remote get-url origin >/dev/null 2>&1; then
        gh repo create "$repository_target" --private --description 'Obsidian工作台、项目任务管理与Apple提醒事项接入设计'
        git push -u origin main
    else
        gh repo create "$repository_target" --private --source . --remote origin --push --description 'Obsidian工作台、项目任务管理与Apple提醒事项接入设计'
    fi
fi
git push origin --tags
gh repo view "$repository_target" --json url,visibility
