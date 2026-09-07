Output assets/claude.gif

Require claude

Set Shell bash
Set Width 1200
Set Height 760
Set FontSize 17
Set TypingSpeed 7ms
Set Framerate 24
Set PlaybackSpeed 1.15
Set Theme "Catppuccin Mocha"
Set Padding 28
Set Margin 24
Set MarginFill "#f5ba45"
Set BorderRadius 16
Set WindowBar Rings
Set CursorBlink false
Set WaitTimeout 60s

Hide
Type `unset CLAUDE_CODE_SSE_PORT TERM_PROGRAM TERM_PROGRAM_VERSION; export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
Enter
Type 'stty -echo; clear; claude --plugin-dir . --setting-sources project --no-chrome --effort low --disallowedTools "Bash,Edit,Write,NotebookEdit,Read,Glob,Grep,Task,WebFetch,WebSearch"; stty echo'
Enter
Wait+Screen@60s /Sonnet 5/
Show

Sleep 3s
Type "/joy:joy pair I'm designing slugify(text). Keep the algorithm mine; pair on Unicode edge cases; delegate one pytest example. Do not inspect or edit files. Reply in at most 12 lines: Keep, two Pair bullets, Delegate, then a three-line Python test."
Sleep 500ms
Enter
Wait+Screen@60s /done [0-9]/
Sleep 5s
