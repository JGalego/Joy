set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# List available recipes.
default:
    @just --list

# Run dependency-free repository validation.
validate:
    node scripts/validate.mjs

# Run Claude Code's official validators.
validate-claude:
    claude plugin validate . --strict
    claude plugin validate ./skills --strict

# Verify local skills.sh discovery.
discover:
    npx --yes skills@latest add . --list

# Run the complete local publication suite.
check: validate validate-claude discover
    git diff HEAD --check

# Re-record the interactive Claude Code demo.
demo: demo-claude

# Re-record the Claude Code demo.
demo-claude:
    vhs assets/claude.tape

# Record the GitHub Copilot CLI demo.
demo-copilot:
    vhs assets/copilot.tape

# Launch the local plugin in Claude Code.
run:
    claude --plugin-dir .
