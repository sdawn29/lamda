export const APP_SETTINGS_KEYS = {
  ACTIVE_THREAD_ID: "active_thread_id",
  NEW_THREAD_WORKSPACE: "new_thread_workspace",
  COMMIT_MESSAGE_PROMPT: "commit_message_prompt",
  SHOW_THINKING: "show_thinking",
  THINKING_PHRASES: "thinking_phrases",
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
