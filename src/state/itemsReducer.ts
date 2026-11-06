import type { CompressResult, ImageItem } from '../types'

export type ItemAction =
  | { type: 'add'; items: ImageItem[] }
  | { type: 'start'; id: string }
  | { type: 'succeed'; id: string; result: CompressResult }
  | { type: 'fail'; id: string; message: string }
  | { type: 'cancel'; id: string }
  | { type: 'requeue'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear' }

function patch(
  state: ImageItem[],
  id: string,
  update: (item: ImageItem) => ImageItem,
): ImageItem[] {
  return state.map((item) => (item.id === id ? update(item) : item))
}

/**
 * 纯状态机。Worker 池、队列、取消都不在这里 —— 这里只描述「一张图处于什么状态」。
 *
 * 两条不变量：
 * - 已取消是终态：只有 requeue 能把它拉回 queued，迟到的工作结果不能。
 * - 取消只对 queued / processing 生效，不会把已完成的结果抹掉。
 */
export function itemsReducer(state: ImageItem[], action: ItemAction): ImageItem[] {
  switch (action.type) {
    case 'add':
      return [...action.items, ...state]

    case 'start':
      return patch(state, action.id, (item) =>
        item.status === 'queued' || item.status === 'canceled'
          ? { ...item, status: 'processing', error: null }
          : item,
      )

    case 'succeed':
      return patch(state, action.id, (item) =>
        item.status === 'canceled'
          ? item
          : { ...item, status: 'done', result: action.result, error: null },
      )

    case 'fail':
      return patch(state, action.id, (item) =>
        item.status === 'canceled'
          ? item
          : { ...item, status: 'error', error: action.message },
      )

    case 'cancel':
      return patch(state, action.id, (item) =>
        item.status === 'queued' || item.status === 'processing'
          ? { ...item, status: 'canceled', result: null, error: null }
          : item,
      )

    case 'requeue':
      return patch(state, action.id, (item) => ({
        ...item,
        status: 'queued',
        result: null,
        error: null,
      }))

    case 'remove':
      return state.filter((item) => item.id !== action.id)

    case 'clear':
      return []
  }
}
