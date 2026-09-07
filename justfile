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

# Re-record both interactive terminal casts.
cast: cast-claude cast-copilot

# Record the Claude Code interactive cast.
cast-claude:
    asciinema rec --overwrite --quiet --cols 120 --rows 38 --idle-time-limit 2 --title "Joy — Claude Code" -c 'stty -echo; clear; exec env -u CLAUDE_CODE_SSE_PORT -u TERM_PROGRAM -u TERM_PROGRAM_VERSION CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 claude --plugin-dir . --setting-sources project --no-chrome --effort low --disallowedTools "Bash,Edit,Write,NotebookEdit,Read,Glob,Grep,Task,WebFetch,WebSearch"' assets/claude.cast

# Record the GitHub Copilot CLI interactive cast.
cast-copilot:
    session_id="$(node -p 'crypto.randomUUID()')" && export GH_TOKEN="$(gh auth token)" && asciinema rec --overwrite --quiet --cols 120 --rows 38 --idle-time-limit 2 --title "Joy — GitHub Copilot CLI" -c "stty -echo; clear; exec env -u TERM_PROGRAM -u TERM_PROGRAM_VERSION COPILOT_MULTIPLEXER=none copilot --plugin-dir . --banner --no-remote --no-auto-update --disable-builtin-mcps --available-tools= --effort low --session-id '$session_id'" assets/copilot.cast

# Preview the Joy site at http://localhost:4173/.
site:
    python3 -m http.server 4173

# Launch the local plugin in Claude Code.
run:
    claude --plugin-dir .
