import Markdown, { type Components } from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"

import { cn } from "@/shared/lib/utils"

const remarkPlugins: PluggableList = [remarkGfm]
const rehypePlugins: PluggableList = [rehypeRaw, rehypeSanitize]

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

const proseClass =
  "prose prose-sm max-w-none dark:prose-invert " +
  "prose-headings:text-foreground prose-headings:font-semibold prose-headings:leading-tight " +
  "prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-h4:text-xs " +
  "prose-p:text-xs prose-p:leading-relaxed prose-p:my-1.5 " +
  "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:text-xs prose-li:my-0.5 " +
  "prose-blockquote:my-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground " +
  "prose-hr:my-3 prose-hr:border-border prose-code:text-xs prose-pre:my-2 prose-pre:overflow-x-auto " +
  "prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 " +
  "[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 " +
  "[&_.task-list-item]:list-none [&_.task-list-item]:pl-0 " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"

export function RemoteMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={cn(proseClass, className)}>
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
