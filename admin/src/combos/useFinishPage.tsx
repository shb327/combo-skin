import { Link, useParams } from 'react-router'
import { ApiError } from '../api/errors'
import { COMBO_MESSAGES } from './messages'
import { BASE, DIRECTION } from './paths'
import { finishLabel, useFinish, type FinishDetail, type Kind } from './queries'
import { LINK } from './styles'
import { QueryState } from './ui'

export const isRetired = (finish: FinishDetail) => !finish.active || !finish.item_type.active

/** The finish's catalog entry, or a message: loading, failed, or not found. */
export function useFinishPage(kind: Kind) {
  const { type = '', finish = '' } = useParams()
  const query = useFinish(kind, type, finish)
  const notFound = query.error instanceof ApiError && query.error.status === 404
  const fallback = notFound ? (
    <section>
      <p role="alert" className="text-white/80">
        {COMBO_MESSAGES.finishNotFound}
      </p>
      <Link to={BASE[kind]} className={`${LINK} mt-2 inline-block`}>
        Back to {DIRECTION[kind]}
      </Link>
    </section>
  ) : (
    <QueryState error={query.error} onRetry={() => query.refetch()} />
  )
  return { type, finish, data: query.data, fallback }
}

export const detailLabel = (finish: FinishDetail) =>
  finishLabel({ type_name: finish.item_type.name, display_name: finish.display_name })
