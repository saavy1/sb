---
name: git-workflow
description: Git workflow guidelines for AI agents working on this repository
---

# Git Workflow

**IMPORTANT: Never commit directly to main.**

## Branch Strategy

Always create a feature branch before making changes:

```bash
# Check current branch
git branch --show-current

# If on main, create and switch to a feature branch
git checkout -b feat/your-feature-name

# Or for fixes
git checkout -b fix/issue-description
```

## Branch Naming

Use conventional prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `chore/` - Maintenance tasks

Examples:
- `feat/app-launcher`
- `fix/api-caching-headers`
- `refactor/system-info-service`

## Workflow

1. **Before starting work:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature
   ```

2. **Make commits on your branch:**
   ```bash
   git add -A
   git commit -m "feat: description of change"
   ```

3. **When ready for review:**
   ```bash
   git push -u origin feat/your-feature
   # Then create PR via GitHub
   ```

4. **Never force push to main or shared branches**

## Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `docs:` - Documentation only
- `chore:` - Maintenance

## If You Accidentally Commit to Main

```bash
# Create a branch from current state
git branch feat/accidental-changes

# Reset main to origin
git reset --hard origin/main

# Switch to your new branch
git checkout feat/accidental-changes
```
