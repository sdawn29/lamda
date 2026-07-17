import { CodeReviewFiles } from "@/features/review"
import { useCreateReviewComment, useReplyToReviewComment } from "../mutations"
import { usePullRequestReview } from "../queries"
import type { RepoContext } from "../types"

/** GitHub-flavored code-review files tab: wires PR review data + mutations. */
export function PullRequestFiles({
  ctx,
  number,
  enabled,
}: {
  ctx: RepoContext
  number: number
  enabled: boolean
}) {
  const {
    data: review,
    isLoading,
    error,
  } = usePullRequestReview(ctx, number, enabled)
  const createComment = useCreateReviewComment(ctx, number)
  const replyToComment = useReplyToReviewComment(ctx, number)

  return (
    <CodeReviewFiles
      review={review}
      isLoading={isLoading}
      error={error}
      createCommentPending={createComment.isPending}
      onCreateComment={(input) =>
        createComment.mutateAsync({
          body: input.body,
          commitId: input.commitId,
          path: input.path,
          side: input.side,
          line: input.line,
        })
      }
      onReplyToComment={(comment, body) =>
        // Replies attach to the thread root; GitHub rejects replies to replies.
        replyToComment.mutateAsync({
          commentId: comment.inReplyToId ?? comment.id,
          body,
        })
      }
    />
  )
}
