export const APP_SETTINGS_KEYS = {
  ACTIVE_THREAD_ID: "active_thread_id",
  NEW_THREAD_WORKSPACE: "new_thread_workspace",
  COMMIT_MESSAGE_PROMPT: "commit_message_prompt",
  COMMIT_MESSAGE_MODEL: "commit_message_model",
  TITLE_GENERATION_PROMPT: "title_generation_prompt",
  TITLE_GENERATION_MODEL: "title_generation_model",
  SHOW_THINKING: "show_thinking",
  RICH_CHAT_RENDERING: "rich_chat_rendering",
  ONBOARDING_COMPLETED: "onboarding_completed",
  THEME: "theme",
  COLOR_THEME: "color_theme",
  CUSTOM_THEME: "custom_theme",
  KEYBOARD_SHORTCUTS: "keyboard_shortcuts",
  UI_FONT: "ui_font",
  CHAT_FONT: "chat_font",
  MONO_FONT: "mono_font",
  CODE_FONT: "code_font",
} as const

export type AppSettingKey = (typeof APP_SETTINGS_KEYS)[keyof typeof APP_SETTINGS_KEYS]
