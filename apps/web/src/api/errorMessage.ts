export function getApiErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = error.response
    if (response && typeof response === 'object' && 'data' in response) {
      const data = response.data
      if (data && typeof data === 'object' && 'message' in data) {
        if (typeof data.message === 'string') return data.message
      }
    }
  }

  return error instanceof Error ? error.message : '请求失败，请重试'
}
