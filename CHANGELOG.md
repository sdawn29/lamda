# Changelog

## [0.19.0](../../releases/tag/v0.19.0) — 2026-06-13

### Features

* update README with new features and enhance chat and todo components
* add model setting component and memory management features
* enhance chat functionality with agent questions and todos tracking

### Bug Fixes

* include mobile state in sidebar toggle logic for title bar
* ensure chat input is filled after confirming mode change in implementPlan
* correct ref type in useLazyFont to HTMLButtonElement

### Other Changes

* Refactor code structure for improved readability and maintainability

## [0.18.0](../../releases/tag/v0.18.0) — 2026-06-12

### Features

* enhance font management with Google Fonts integration, add font selection UI, and update styling for code blocks
* update styling in chat components, enhance session management, and add lamda-specific system context
* enhance tool run group description and improve category breakdown in WorkingBlock component
* improve styling and layout in chat components, enhance reconnect logic in session stream, and add new color theme
* enhance AI usage stats query with date range filtering

## [0.17.0](../../releases/tag/v0.17.0) — 2026-06-11

### Features

* implement AI usage tracking and reporting features
* categorize tools into groups for improved display in WorkingBlock component
* enhance slash command handling in RichInput component
* add delay prop to Tooltip for customizable tooltip display timing

## [0.16.0](../../releases/tag/v0.16.0) — 2026-06-11

### Features

* add support for Latte theme by remapping Macchiato colors in light mode
* add macOS theme and update corner radius for built-in themes
* enhance git functionality with workspace-level history and diff stats
* add WebLinksAddon to terminal for clickable URLs and update dependencies
* enhance LSP installation process and UI integration
* **chat:** replace ServerCrashIcon with ZapIcon and update styles for skill chips
* **auth:** allow 'file://' origin in isAllowedOrigin function for WebSocket upgrades

### Other Changes

* Refactor settings UI components and improve layout

## [0.15.0](../../releases/tag/v0.15.0) — 2026-06-10

### Features

* **chat:** replace TerminalIcon with ServerCrashIcon and update slash command display names
* **auth:** implement token-based authentication for server API and WebSocket connections
* **terminal:** implement WebSocket heartbeat and auto-reconnect logic for improved connection stability
* **context-usage:** add ContextBreakdown interface and integrate into ContextUsage for detailed token tracking

### Code Refactoring

* unify text sizing and styles across components

## [0.14.0](../../releases/tag/v0.14.0) — 2026-06-08

### Features

* **checkpoint-management:** implement durable checkpoint refs for git operations and enhance thread handling
* **session-management:** enhance session handling with mode preamble injection and stripping
* **chat-view:** enhance bottom bar layout and spacing for improved message visibility

### Other Changes

* Merge pull request #6 from sdawn29/plugin-system

## [0.13.0](../../releases/tag/v0.13.0) — 2026-06-05

### Features

* **chat-stream:** update markStopped to clear loading state on abort confirmation
* **session-events:** add method to identify new file statuses in git feat(file-changes-card): set initial expanded state to false fix(thread-status-store): notify listeners on workspace file updates feat(monaco-diff-viewer): disable extra features for read-only diff viewer feat(monaco-code-viewer): simplify viewer settings for syntax highlighting fix(file-content-view): improve background refresh handling for file loading

## [0.12.0](../../releases/tag/v0.12.0) — 2026-06-05

### Features

* **terminal:** implement persistent PTY sessions with reattachment and cleanup

## [0.11.0](../../releases/tag/v0.11.0) — 2026-06-05

### Features

* **question-tool:** enhance question handling and visibility in chat components

## [0.10.1](../../releases/tag/v0.10.1) — 2026-06-05

### Bug Fixes

* **update-dialog:** add rehype-raw and rehype-sanitize for HTML parsing and sanitization

## [0.10.0](../../releases/tag/v0.10.0) — 2026-06-04

### Features

* **mode:** change default mode from 'code' to 'agent' across the application
* **question:** implement question tool for user interaction with multiple-choice questions

### Bug Fixes

* **chat:** enhance chat message grouping and UI for plan changes and saved cards

## [0.9.0](../../releases/tag/v0.9.0) — 2026-06-04

### Features

* **update:** enhance update handling with release notes and new update dialog
* **chat:** add history recall functionality for last sent message using ArrowUp
* **build:** update handling of @silvia-odwyer/photon-node dependency resolution

### Code Refactoring

* **git:** unify agent turns handling by replacing sessionId with threadId

## [0.8.0](../../releases/tag/v0.8.0) — 2026-06-04

### Features

* **git:** enhance gitClone to return the cloned path and update related functions
* **git:** implement per-turn file diffs and enhance commit message generation
* **todos:** implement completed goals tracking and inline display in chat
* **themes:** introduce code palette for syntax highlighting in Monaco editor and Markdown
* **themes:** implement theming engine with built-in and custom themes
* enhance error handling in chat components with expandable error messages and copy functionality
* enhance local models configuration and validation
* enhance Monaco diff viewer with layout coordination and add header component
* enhance LSP integration with signature help support and improve UI components
* implement Monaco diff viewer with lazy loading and enhanced line number highlighting
* add Monaco code viewer with lazy loading and LSP integration
* remove LspCodeViewer component to streamline codebase
* refactor file and review panel components for improved key handling and state management
* **file:** enhance file handling with range support and streaming
* implement lazy loading for file tree with directory watchers
* **local-models:** implement local model provider management with CRUD operations and UI integration
* add workspace branch endpoints and integrate with git functionality

### Code Refactoring

* migrate MCP server management to application-wide scope

### Chores

* update dependencies and enhance session management

### Other Changes

* Updated some packages

## [0.7.1](../../releases/tag/v0.7.1) — 2026-05-28

### Features

* **assets:** update application icons for desktop

## [0.7.0](../../releases/tag/v0.7.0) — 2026-05-28

### Features

* update routing to use memory history and enhance settings redirection logic
* **workspaces:** add workspace icon detection and management feat(chat): implement pagination for message history loading feat(chat): enhance message storage with pagination support feat(electron): add auto-update check functionality refactor(git): optimize git command execution with no-optional-locks
* enhance message handling and workspace management in chat components
* **CommandPalette:** add reload window option to command palette
* add settings sections for appearance, chat, subscriptions, api keys, git, shortcuts, lsp, retry, updates, and data management
* **todos:** implement todo tool and integrate with thread management
* implement git status broadcasting and update related components
* **FileChangesCard:** filter displayed files based on git status and update file handling logic feat(FileContentView): subscribe to workspace file updates for real-time file refresh
* implement system resume handling with WebSocket reconnection and update API

### Code Refactoring

* improve performance and readability in various components

## [0.6.0](../../releases/tag/v0.6.0) — 2026-05-26

### Features

* **plan:** enhance plan mode with persistent markdown saving, auto-switching to code mode, and inline review capabilities
* **ChatView:** remove unused isLoadingMessages prop from ChatView component

## [0.5.0](../../releases/tag/v0.5.0) — 2026-05-24

### Features

* **SourceControl:** remove stash functionality from toolbar and content sections
* **docs:** update README and API documentation; add workspace tasks guide
* **window:** increase splash window dimensions for improved visibility
* **ThreadRow:** align thread timestamp to the right for better layout

## [0.4.0](../../releases/tag/v0.4.0) — 2026-05-23

### Features

* **layout:** update sidebar and panel styles for improved UI consistency
* **chat:** add file comment context functionality
* **session:** refactor session management to use openSessionForThread and createSessionForThread
* **models:** integrate getSupportedThinkingLevels for enhanced model reasoning

### Code Refactoring

* rename diff panel to review panel and update related hooks and shortcuts

## [0.3.0](../../releases/tag/v0.3.0) — 2026-05-23

### Features

* **client:** enhance shell path resolution for improved command execution
* **release:** improve tag retrieval to use highest semver tag

## [0.2.0](../../releases/tag/v0.2.0) — 2026-05-23

### Features

* **mcp:** enhance client connection handling and improve cleanup logic
* **notarization:** load environment variables from .env file if it exists
* **notarization:** add notarization support for macOS using @electron/notarize
* **workspace:** add pinning functionality for workspaces
* **chat:** integrate thinking level management in chat components and new thread view
* **diff:** update color scheme for diff indicators to enhance visibility
* **chat:** enhance chat view with plan and file changes cards integration
* **chat:** add mode selection and new thread functionality
* **lsp:** add Language Server Protocol support for file viewer and workspace
* **tasks:** implement task management features including CRUD operations
* optimize diff rendering with memoization and enhance terminal panel layout
* **chat:** enhance message grouping and display with additional properties for assistant messages
* add best practices for server-side caching and deduplication in React
* **chat:** enhance chat view and tool call block with file path display
* **chat:** implement word reveal functionality and enhance message display
* implement thread forking functionality with associated data handling
* **chat:** add fork functionality to user messages
* **git:** enhance commit dialog and git status handling
* update AGENTS.md files and implement RollingTimerText component for enhanced timer display
* **main-tabs, tasks:** add AGENTS.md files for main tabs and tasks features with detailed context and API documentation
* **prose:** enhance prose styling for consistent theme rendering across light and dark modes
* **terminal:** update terminal themes for improved color consistency and readability
* **chat:** enhance file changes card with open in editor functionality and improve UI
* add session status endpoint and related types for improved session management
* enhance chat and terminal components with improved compaction handling and UI updates
* update sidebar and terminal styles for improved UI consistency
* streamline session and workspace indexing by excluding unnecessary directories
* update styling in chat view, main tab bar, and terminal panel for improved UI consistency
* implement hunk staging and un-staging functionality in diff view
* enhance chat and session handling with thinking level preservation and UI improvements
* remove unused font dependencies and improve chat scroll handling
* improve code readability and formatting in workspace empty state component
* implement splash screen and update branding elements across the application
* enhance chat and workspace features
* enhance chat functionality with abort handling, transport error suppression, and session state management
* enhance chat view and message handling with stable session IDs, improved scroll behavior, and updated tooltip components
* migrate from React Context to Zustand for state management
* implement cleanup for abandoned OAuth logins, enhance workspace idle management, and improve error handling in WebSocket connections
* update styles for TitleBar, Dialog, and Tooltip components to improve UI consistency
* implement tab reordering functionality in main tabs context and UI
* add thread tab functionality and implement empty state for tabs
* enhance UI consistency by adjusting component heights and improving color contrast
* enhance performance by batching deltas, adding indexes, and optimizing queries
* implement main tabs functionality for workspace and file management
* **explore-skills:** add explore skill and directory structure references for codebase navigation
* **git:** add preContent field to LastTurnFile interface and update related logic
* **release:** enhance workspace package handling in release script
* implement model cache invalidation and update related components
* **sessions:** improve error handling in session abort and compact operations
* **terminal:** enhance tab bar styling and improve button interactions
* **mcp:** enhance session tool management and improve server settings handling
* **chat:** enhance message animation handling and optimize scroll persistence
* **chat:** refactor file change invalidation and improve tool execution handling
* implement last turn changes and revert functionality
* **file-header:** add HTML preview toggle functionality and update props
* **title-bar:** improve MCP server button layout and styling
* **chat-view:** auto-focus chat textbox on mount
* **diff-panel:** add stash changes button and improve layout in source control feat(file-header): enhance file header with icons and tooltip for actions feat(files-section): update label styling for better visibility feat(stash-section): improve stash section label styling for consistency
* **title-bar:** enhance renaming input with better accessibility and layout
* **workspace:** wrap FileTree component in Suspense for improved loading experience
* **settings:** update layout and enhance sidebar navigation in settings page
* **mcp-service:** add manuallyStopped flag to prevent auto-reconnects for stopped servers
* **mcp:** implement MCP server management with start, stop, and enable/disable functionality
* **mcp:** enhance MCP server management and tool integration
* **mcp:** add Model Context Protocol integration
* refactor file changes card and introduce FileListItem component for better file display
* refactor getAvailableModels to use getSupportedThinkingLevels and remove unused constants
* update AGENTS.md files for various features and add documentation structure
* enhance error handling and introduce compacting indicator in chat components
* add new API key providers and their corresponding icons
* add dismiss error endpoint and integrate with chat stream for improved error handling
* enhance error handling and thread status management in chat components
* enhance error handling in ChatView and MessageRow components
* enhance clipboard handling and cleanup timers in various components
* refactor useSessionStream and useChatStream for improved WebSocket handling and state management
* refactor file icon handling and enhance chip components with new icon integration
* enhance session event handling with partial results and update thread status management
* improve thinking level defaulting logic in ChatTextbox component
* enhance FileHeader and FileContent components with HTML and PDF handling
* add Command Palette feature module with keyboard-driven command interface and WebSocket command protocol
* refactor terminal context and components for workspace-specific handling
* update terminal connection handling and improve error handling in WebSocket functions
* refactor file handling in DiffPanel and optimize search functionality in CommandPalette
* refactor file handling and enhance image support in DiffPanel
* update CommandPalette to use CommandShortcut for workspace names and refactor useDiffPanel destructuring
* replace file icon rendering with Iconify integration in CommandPalette
* enhance CommandPalette with file search functionality and workspace indexing
* adjust padding in TitleBar and enhance AppSidebar layout with command palette integration
* implement command palette feature with context and keyboard shortcuts
* reset loading state on cleanup in useSessionStream to prevent stale status
* update AGENTS.md to include detailed layout feature module documentation
* add session commands WebSocket channel with retry logic
* enhance AGENTS.md documentation and add new feature modules for workspace, file tree, and electron integration
* implement WebSocket support for session and global events, replacing SSE
* add .fallow to .gitignore for improved file management
* implement git clone functionality with UI support for local and remote repositories
* add support for additional JavaScript and TypeScript file extensions in syntax highlighting
* add file icons to file accordion items for better visual representation
* integrate Iconify for file icons and add Catppuccin icon set
* enhance performance and usability in workspace and settings
* **settings:** replace Toggle with Switch component for improved UI interaction
* **threads:** add pin and unpin functionality for threads with UI updates
* **chat:** enhance RichInput to support multi-line text input with line breaks
* **provider:** add provider icons and metadata for improved UI representation
* **chat:** render all heading levels as h4 for a more compact chat UI
* **chat:** add createdAt timestamp to UserMessage and AssistantMessage interfaces
* **toast:** enhance error toast display and theming for better user experience
* **chat:** refactor error toast handling for improved display and retry functionality
* **chat:** implement error toast handling and integrate with chat view
* **chat:** add duration and startTime to ToolMessage for better execution tracking
* **chat:** enhance layout of AssistantMessageBlock for better error message display
* **chat:** implement ErrorBlock component for improved error handling and actions
* **chat:** refactor error handling and improve UI feedback for error messages
* enhance session handling with new prompt options and error management
* **chat:** enhance error handling by persisting error messages across thread navigation
* **chat:** enhance error handling and messaging in chat components
* **terminal:** implement tab management with add, close, and rename functionalities
* add ErrorBoundary component for improved error handling in RootLayout
* add diff statistics and file management components
* **resizable:** implement resizable panels and integrate into workspace layout
* **diff-panel:** add fullscreen toggle functionality and improve resizing behavior
* **commit-dialog:** enhance commit dialog with improved UI and functionality
* **chat:** add TokenCounter component for displaying token usage in messages
* **chat:** enhance ChatTextbox and ChatView for improved user experience and responsiveness
* **release:** add rollback job to handle failed releases by deleting tags and reverting commits
* **release:** improve release workflow by enhancing error messages and updating release notes generation
* enhance release notes generation in release workflow

### Bug Fixes

* **chat:** ensure long words wrap in message bubbles
* update package references and improve error handling in workspace thread management
* **thinking-block:** update import type and adjust class order for consistency
* **thinking-block:** enhance code block rendering and type definitions
* **release:** prevent duplicate tag creation in release script
* remove markdown and mdx from EXT_TO_LANG to prevent incorrect language detection
* **build:** improve error handling for missing electron and server files
* correct repository name in package.json from 'lambda' to 'lamda'

### Code Refactoring

* improve performance and code quality across various components
* simplify diff handling and remove hunk staging functionality
* update pi-coding-agent dependency to @earendil-works version
* **chat:** simplify ThinkingBlock component and integrate ReactMarkdown for rendering
* **chat:** remove unused import of useQueryClient in queries.ts
* **chat:** format imports and clean up comments in useMessages function
* enhance UI components for better consistency and usability
* replace getFileIcon with getIconName for improved icon handling in file components
* replace button elements with Button component in various files
* add functionality to open data directory from settings page
* update terminal theme colors for improved contrast and readability
* update ThreadRow component to use IconButtonWithTooltip and improve pin/archive functionality
* add keyboard shortcuts for toggling file tree and fullscreen diff
* improve query refetching logic for Git status and file diff hooks
* enhance file changes display with per-file line stats and update styling
* add FileChangesCard component to display file changes after chat completion
* enhance documentation for chat and git feature modules with detailed AGENTS.md files
* simplify SVG icon classes by using constants for improved maintainability
* update terminal and tooltip themes for improved aesthetics and consistency
* update color variables and enhance styling for light and dark themes
* enhance chat feature by adding query invalidation on thread switch
* consolidate global providers and enhance type exports in chat and settings features
* enhance file change invalidation and prefetching logic with improved signal handling and timeout management
* remove directory route and optimize workspace indexing in file management
* optimize replaceWorkspaceFiles function and add loading skeleton to FileTree component
* implement workspace indexing and enhance file management across components
* integrate FileSearchModal into DiffPanel and enhance file handling
* streamline markdown preview activation in FileContent component
* enhance diff panel context management and improve workspace path handling
* add markdown preview functionality and enhance FileHeader component
* enhance diff panel functionality with fullscreen toggle and active tab management
* simplify file icon handling and adjust text styles in FileTree component
* remove unused bottomRef and simplify scrolling logic in ChatView
* enhance file icon handling and add color class for improved file type display
* adjust ResizablePanel size and update FileTree width for improved layout
* implement file change invalidation hook and enhance file tree queries
* add abort message handling and update database schema for abort role
* adjust label width in ContextChart for improved display
* remove unused components and streamline session stats display in ContextChart
* update AGENTS.md last modified dates and add session stats endpoint with detailed token usage in chat components
* update last modified date in AGENTS.md and adjust tool expansion behavior in ToolCallBlock
* update last modified dates in AGENTS.md files to 2026-04-23
* enhance session handling and loading state management in chat streams
* add running tools endpoint and enhance session event handling
* remove unused line-number class and useEffect import
* **agents:** update last modified dates and enhance API key provider options
* **settings:** update icon for subscriptions and enhance theme selection UI
* **diff-panel:** enhance layout structure in SourceControlContent and improve styling in StashSection
* **file-header:** implement FileHeader component for file navigation and opening with selected editor
* **layout:** improve layout structure and styling in TitleBar and WorkspaceThreadRoute
* **workspace:** integrate current workspace management in DiffPanel
* add file route and integrate file handling in the server
* **file-tree:** add file tree component and context for directory navigation
* **chat:** implement immediate scroll and optimistic message caching in chat stream
* **chat:** implement chat sync engine for localStorage persistence and background synchronization
* **chat:** update message prefetching logic and improve thread switching performance
* streamline settings page imports and remove unused components
* **app-sidebar:** simplify thread pinning logic and improve UI for pinned threads
* **chat:** update button styles in ChatTextbox for improved UI consistency
* **terminal:** update addTab method to return tab ID and simplify tab management logic
* **chat:** remove unnecessary max-width from ToolCallBlock component
* **chat:** simplify ThinkingBlock component by removing unused code and enhancing text rendering
* **chat:** update message types and adjust layout for improved readability
* **chat:** improve code formatting and adjust scroll button positioning
* **diff-panel, stash-section:** improve type safety and error handling
* **chat, diff-panel, workspace:** enhance layout and styling for improved user experience
* **diff-panel:** improve hover effects and button layout in FileAccordionItem
* **commit-dialog, diff-panel:** improve file name display and formatting in FileAccordionItem
* **diff-panel:** enhance status badge and diff stat display
* **chat:** improve code readability and formatting in message-row component

### Documentation

* update AGENTS.md for MCP client integration and add quick reference
* restructure documentation with new sections for API, architecture, CLI, and getting started
* add detailed AGENTS.md for server REST routes

### Chores

* **deps:** update brace-expansion and other dependencies to latest versions
* remove release workflow and related configuration files; add local release script
* update @mariozechner/pi-coding-agent to version 0.73.0
* update AGENTS.md last updated date and SDK version in pi-sdk
* update pi-coding-agent dependency and refactor session tool creation
* update AGENTS.md dates and improve code block typography
* update AGENTS.md files with latest auto-generated context date
* update pi-coding-agent to 0.67.68

### Other Changes

* v0.1.0
* v0.1.0
* v0.1.0
* Merge pull request #5 from sdawn29/feat/tab-views
* Add comprehensive documentation for MCP, Settings, Terminal, and Workspaces features
* v0.1.0
* v0.1.0
* improve layout and readability in ToolCallBlock and AppSidebar components; add dark mode prose overrides in CSS
* v0.1.0
* Merge pull request #3 from sdawn29/feat/mcp-server-integration
* Merge pull request #2 from sdawn29/resizable-refactor
* Merge pull request #1 from sdawn29/resizable-refactor
* update primary color variables for improved visual consistency in light and dark themes
* enhance link and folder icon styles for improved visual consistency
* update sidebar border color for improved visual consistency in file tree component
* update primary color and related variables for improved consistency across themes
* update text color for improved readability in chat components
* update Light and Dark theme color palettes
* Refactor chat message handling to use structured message blocks
* Revert "release: v0.0.4"
* v0.0.4
* v0.0.3
* v0.0.2

## [0.1.0](../../releases/tag/v0.1.0) — 2026-05-23

### Features

- **notarization:** add notarization support for macOS using @electron/notarize
- **workspace:** add pinning functionality for workspaces
- **chat:** integrate thinking level management in chat components and new thread view
- **diff:** update color scheme for diff indicators to enhance visibility
- **chat:** enhance chat view with plan and file changes cards integration
- **chat:** add mode selection and new thread functionality
- **lsp:** add Language Server Protocol support for file viewer and workspace
- **tasks:** implement task management features including CRUD operations
- optimize diff rendering with memoization and enhance terminal panel layout
- **chat:** enhance message grouping and display with additional properties for assistant messages
- add best practices for server-side caching and deduplication in React
- **chat:** enhance chat view and tool call block with file path display
- **chat:** implement word reveal functionality and enhance message display
- implement thread forking functionality with associated data handling
- **chat:** add fork functionality to user messages
- **git:** enhance commit dialog and git status handling
- update AGENTS.md files and implement RollingTimerText component for enhanced timer display
- **main-tabs, tasks:** add AGENTS.md files for main tabs and tasks features with detailed context and API documentation
- **prose:** enhance prose styling for consistent theme rendering across light and dark modes
- **terminal:** update terminal themes for improved color consistency and readability
- **chat:** enhance file changes card with open in editor functionality and improve UI
- add session status endpoint and related types for improved session management
- enhance chat and terminal components with improved compaction handling and UI updates
- update sidebar and terminal styles for improved UI consistency
- streamline session and workspace indexing by excluding unnecessary directories
- update styling in chat view, main tab bar, and terminal panel for improved UI consistency
- implement hunk staging and un-staging functionality in diff view
- enhance chat and session handling with thinking level preservation and UI improvements
- remove unused font dependencies and improve chat scroll handling
- improve code readability and formatting in workspace empty state component
- implement splash screen and update branding elements across the application
- enhance chat and workspace features
- enhance chat functionality with abort handling, transport error suppression, and session state management
- enhance chat view and message handling with stable session IDs, improved scroll behavior, and updated tooltip components
- migrate from React Context to Zustand for state management
- implement cleanup for abandoned OAuth logins, enhance workspace idle management, and improve error handling in WebSocket connections
- update styles for TitleBar, Dialog, and Tooltip components to improve UI consistency
- implement tab reordering functionality in main tabs context and UI
- add thread tab functionality and implement empty state for tabs
- enhance UI consistency by adjusting component heights and improving color contrast
- enhance performance by batching deltas, adding indexes, and optimizing queries
- implement main tabs functionality for workspace and file management
- **explore-skills:** add explore skill and directory structure references for codebase navigation
- **git:** add preContent field to LastTurnFile interface and update related logic
- **release:** enhance workspace package handling in release script
- implement model cache invalidation and update related components
- **sessions:** improve error handling in session abort and compact operations
- **terminal:** enhance tab bar styling and improve button interactions
- **mcp:** enhance session tool management and improve server settings handling
- **chat:** enhance message animation handling and optimize scroll persistence
- **chat:** refactor file change invalidation and improve tool execution handling
- implement last turn changes and revert functionality
- **file-header:** add HTML preview toggle functionality and update props
- **title-bar:** improve MCP server button layout and styling
- **chat-view:** auto-focus chat textbox on mount
- **diff-panel:** add stash changes button and improve layout in source control feat(file-header): enhance file header with icons and tooltip for actions feat(files-section): update label styling for better visibility feat(stash-section): improve stash section label styling for consistency
- **title-bar:** enhance renaming input with better accessibility and layout
- **workspace:** wrap FileTree component in Suspense for improved loading experience
- **settings:** update layout and enhance sidebar navigation in settings page
- **mcp-service:** add manuallyStopped flag to prevent auto-reconnects for stopped servers
- **mcp:** implement MCP server management with start, stop, and enable/disable functionality
- **mcp:** enhance MCP server management and tool integration
- **mcp:** add Model Context Protocol integration
- refactor file changes card and introduce FileListItem component for better file display
- refactor getAvailableModels to use getSupportedThinkingLevels and remove unused constants
- update AGENTS.md files for various features and add documentation structure
- enhance error handling and introduce compacting indicator in chat components
- add new API key providers and their corresponding icons
- add dismiss error endpoint and integrate with chat stream for improved error handling
- enhance error handling and thread status management in chat components
- enhance error handling in ChatView and MessageRow components
- enhance clipboard handling and cleanup timers in various components
- refactor useSessionStream and useChatStream for improved WebSocket handling and state management
- refactor file icon handling and enhance chip components with new icon integration
- enhance session event handling with partial results and update thread status management
- improve thinking level defaulting logic in ChatTextbox component
- enhance FileHeader and FileContent components with HTML and PDF handling
- add Command Palette feature module with keyboard-driven command interface and WebSocket command protocol
- refactor terminal context and components for workspace-specific handling
- update terminal connection handling and improve error handling in WebSocket functions
- refactor file handling in DiffPanel and optimize search functionality in CommandPalette
- refactor file handling and enhance image support in DiffPanel
- update CommandPalette to use CommandShortcut for workspace names and refactor useDiffPanel destructuring
- replace file icon rendering with Iconify integration in CommandPalette
- enhance CommandPalette with file search functionality and workspace indexing
- adjust padding in TitleBar and enhance AppSidebar layout with command palette integration
- implement command palette feature with context and keyboard shortcuts
- reset loading state on cleanup in useSessionStream to prevent stale status
- update AGENTS.md to include detailed layout feature module documentation
- add session commands WebSocket channel with retry logic
- enhance AGENTS.md documentation and add new feature modules for workspace, file tree, and electron integration
- implement WebSocket support for session and global events, replacing SSE
- add .fallow to .gitignore for improved file management
- implement git clone functionality with UI support for local and remote repositories
- add support for additional JavaScript and TypeScript file extensions in syntax highlighting
- add file icons to file accordion items for better visual representation
- integrate Iconify for file icons and add Catppuccin icon set
- enhance performance and usability in workspace and settings
- **settings:** replace Toggle with Switch component for improved UI interaction
- **threads:** add pin and unpin functionality for threads with UI updates
- **chat:** enhance RichInput to support multi-line text input with line breaks
- **provider:** add provider icons and metadata for improved UI representation
- **chat:** render all heading levels as h4 for a more compact chat UI
- **chat:** add createdAt timestamp to UserMessage and AssistantMessage interfaces
- **toast:** enhance error toast display and theming for better user experience
- **chat:** refactor error toast handling for improved display and retry functionality
- **chat:** implement error toast handling and integrate with chat view
- **chat:** add duration and startTime to ToolMessage for better execution tracking
- **chat:** enhance layout of AssistantMessageBlock for better error message display
- **chat:** implement ErrorBlock component for improved error handling and actions
- **chat:** refactor error handling and improve UI feedback for error messages
- enhance session handling with new prompt options and error management
- **chat:** enhance error handling by persisting error messages across thread navigation
- **chat:** enhance error handling and messaging in chat components
- **terminal:** implement tab management with add, close, and rename functionalities
- add ErrorBoundary component for improved error handling in RootLayout
- add diff statistics and file management components
- **resizable:** implement resizable panels and integrate into workspace layout
- **diff-panel:** add fullscreen toggle functionality and improve resizing behavior
- **commit-dialog:** enhance commit dialog with improved UI and functionality
- **chat:** add TokenCounter component for displaying token usage in messages
- **chat:** enhance ChatTextbox and ChatView for improved user experience and responsiveness

### Bug Fixes

- **chat:** ensure long words wrap in message bubbles
- update package references and improve error handling in workspace thread management
- **thinking-block:** update import type and adjust class order for consistency
- **thinking-block:** enhance code block rendering and type definitions
- **release:** prevent duplicate tag creation in release script
- remove markdown and mdx from EXT_TO_LANG to prevent incorrect language detection

### Code Refactoring

- improve performance and code quality across various components
- simplify diff handling and remove hunk staging functionality
- update pi-coding-agent dependency to @earendil-works version
- **chat:** simplify ThinkingBlock component and integrate ReactMarkdown for rendering
- **chat:** remove unused import of useQueryClient in queries.ts
- **chat:** format imports and clean up comments in useMessages function
- enhance UI components for better consistency and usability
- replace getFileIcon with getIconName for improved icon handling in file components
- replace button elements with Button component in various files
- add functionality to open data directory from settings page
- update terminal theme colors for improved contrast and readability
- update ThreadRow component to use IconButtonWithTooltip and improve pin/archive functionality
- add keyboard shortcuts for toggling file tree and fullscreen diff
- improve query refetching logic for Git status and file diff hooks
- enhance file changes display with per-file line stats and update styling
- add FileChangesCard component to display file changes after chat completion
- enhance documentation for chat and git feature modules with detailed AGENTS.md files
- simplify SVG icon classes by using constants for improved maintainability
- update terminal and tooltip themes for improved aesthetics and consistency
- update color variables and enhance styling for light and dark themes
- enhance chat feature by adding query invalidation on thread switch
- consolidate global providers and enhance type exports in chat and settings features
- enhance file change invalidation and prefetching logic with improved signal handling and timeout management
- remove directory route and optimize workspace indexing in file management
- optimize replaceWorkspaceFiles function and add loading skeleton to FileTree component
- implement workspace indexing and enhance file management across components
- integrate FileSearchModal into DiffPanel and enhance file handling
- streamline markdown preview activation in FileContent component
- enhance diff panel context management and improve workspace path handling
- add markdown preview functionality and enhance FileHeader component
- enhance diff panel functionality with fullscreen toggle and active tab management
- simplify file icon handling and adjust text styles in FileTree component
- remove unused bottomRef and simplify scrolling logic in ChatView
- enhance file icon handling and add color class for improved file type display
- adjust ResizablePanel size and update FileTree width for improved layout
- implement file change invalidation hook and enhance file tree queries
- add abort message handling and update database schema for abort role
- adjust label width in ContextChart for improved display
- remove unused components and streamline session stats display in ContextChart
- update AGENTS.md last modified dates and add session stats endpoint with detailed token usage in chat components
- update last modified date in AGENTS.md and adjust tool expansion behavior in ToolCallBlock
- update last modified dates in AGENTS.md files to 2026-04-23
- enhance session handling and loading state management in chat streams
- add running tools endpoint and enhance session event handling
- remove unused line-number class and useEffect import
- **agents:** update last modified dates and enhance API key provider options
- **settings:** update icon for subscriptions and enhance theme selection UI
- **diff-panel:** enhance layout structure in SourceControlContent and improve styling in StashSection
- **file-header:** implement FileHeader component for file navigation and opening with selected editor
- **layout:** improve layout structure and styling in TitleBar and WorkspaceThreadRoute
- **workspace:** integrate current workspace management in DiffPanel
- add file route and integrate file handling in the server
- **file-tree:** add file tree component and context for directory navigation
- **chat:** implement immediate scroll and optimistic message caching in chat stream
- **chat:** implement chat sync engine for localStorage persistence and background synchronization
- **chat:** update message prefetching logic and improve thread switching performance
- streamline settings page imports and remove unused components
- **app-sidebar:** simplify thread pinning logic and improve UI for pinned threads
- **chat:** update button styles in ChatTextbox for improved UI consistency
- **terminal:** update addTab method to return tab ID and simplify tab management logic
- **chat:** remove unnecessary max-width from ToolCallBlock component
- **chat:** simplify ThinkingBlock component by removing unused code and enhancing text rendering
- **chat:** update message types and adjust layout for improved readability
- **chat:** improve code formatting and adjust scroll button positioning
- **diff-panel, stash-section:** improve type safety and error handling
- **chat, diff-panel, workspace:** enhance layout and styling for improved user experience
- **diff-panel:** improve hover effects and button layout in FileAccordionItem
- **commit-dialog, diff-panel:** improve file name display and formatting in FileAccordionItem
- **diff-panel:** enhance status badge and diff stat display
- **chat:** improve code readability and formatting in message-row component

### Documentation

- update AGENTS.md for MCP client integration and add quick reference
- restructure documentation with new sections for API, architecture, CLI, and getting started
- add detailed AGENTS.md for server REST routes

### Chores

- **deps:** update brace-expansion and other dependencies to latest versions
- remove release workflow and related configuration files; add local release script
- update @mariozechner/pi-coding-agent to version 0.73.0
- update AGENTS.md last updated date and SDK version in pi-sdk
- update pi-coding-agent dependency and refactor session tool creation
- update AGENTS.md dates and improve code block typography
- update AGENTS.md files with latest auto-generated context date
- update pi-coding-agent to 0.67.68

### Other Changes

- v0.1.0
- Merge pull request #5 from sdawn29/feat/tab-views
- Add comprehensive documentation for MCP, Settings, Terminal, and Workspaces features
- v0.1.0
- v0.1.0
- improve layout and readability in ToolCallBlock and AppSidebar components; add dark mode prose overrides in CSS
- v0.1.0
- Merge pull request #3 from sdawn29/feat/mcp-server-integration
- Merge pull request #2 from sdawn29/resizable-refactor
- Merge pull request #1 from sdawn29/resizable-refactor
- update primary color variables for improved visual consistency in light and dark themes
- enhance link and folder icon styles for improved visual consistency
- update sidebar border color for improved visual consistency in file tree component
- update primary color and related variables for improved consistency across themes
- update text color for improved readability in chat components
- update Light and Dark theme color palettes
- Refactor chat message handling to use structured message blocks
