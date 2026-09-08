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
check: validate validate-claude discover case-study
    git diff HEAD --check

# Re-record the interactive Claude Code demo.
demo: demo-claude

# Re-record the Claude Code demo.
demo-claude:
    vhs assets/claude.tape

# Record the GitHub Copilot CLI demo.
demo-copilot:
    vhs assets/copilot.tape

# Re-record the interactive terminal casts.
cast: cast-claude cast-copilot cast-case-study

# Record the Claude Code interactive cast.
cast-claude:
    python3 scripts/record_cast.py claude assets/claude.cast

# Record the GitHub Copilot CLI interactive cast.
cast-copilot:
    export GH_TOKEN="$(gh auth token)" && python3 scripts/record_cast.py copilot assets/copilot.cast

# Record the extended, chaptered Claude Code case study.
cast-case-study:
    python3 scripts/record_cast.py case-study assets/case-study.cast

# Run the executable proof used by the case study.
case-study:
    python3 -m unittest discover -s examples/webhook_worker/tests -v

# Preview the Joy site at http://localhost:4173/.
site:
    python3 -m http.server 4173

# Launch the local plugin in Claude Code.
run:
    claude --plugin-dir .
